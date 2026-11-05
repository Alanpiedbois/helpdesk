import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateMessageDto,
  CreateTicketDto,
  ListTicketsQuery,
  UpdateTicketDto,
} from './dto.js';
import {
  isStaff,
  statusAfterReply,
  visibleTicketsWhere,
} from './tickets.policy.js';

// Explicit selects: the API returns only these fields, never the users' password hashes,
// and the shape stays stable even when columns are added to the tables.
const userSummary = { select: { id: true, name: true } } as const;

const ticketSummarySelect = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  category: true,
  createdAt: true,
  updatedAt: true,
  author: userSummary,
  assignee: userSummary,
} satisfies Prisma.TicketSelect;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the ticket and its first message in one statement (nested write = one transaction). */
  async create(user: AuthUser, dto: CreateTicketDto) {
    const ticket = await this.prisma.ticket.create({
      data: {
        subject: dto.subject,
        priority: dto.priority,
        authorId: user.id,
        messages: { create: { authorId: user.id, body: dto.body } },
      },
      select: { id: true },
    });
    return this.findOne(user, ticket.id);
  }

  async list(user: AuthUser, query: ListTicketsQuery) {
    const where: Prisma.TicketWhereInput = {
      ...visibleTicketsWhere(user),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.assigned === 'me' && { assigneeId: user.id }),
      ...(query.assigned === 'none' && { assigneeId: null }),
    };

    // Page + total count read in one transaction so they are consistent with each other.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        select: ticketSummarySelect,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    } satisfies Page<(typeof items)[number]>;
  }

  /**
   * One ticket with its conversation. A client asking for someone else's ticket gets 404,
   * not 403: answering "forbidden" would confirm that the ticket exists.
   */
  async findOne(user: AuthUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...visibleTicketsWhere(user) },
      select: {
        ...ticketSummarySelect,
        messages: {
          where: isStaff(user) ? {} : { internal: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            internal: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async addMessage(user: AuthUser, ticketId: string, dto: CreateMessageDto) {
    const internal = dto.internal ?? false;
    if (internal && !isStaff(user)) {
      throw new ForbiddenException('Only staff can write internal notes');
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, ...visibleTicketsWhere(user) },
      select: { status: true, assigneeId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ConflictException('Ticket is closed');
    }

    const status = statusAfterReply(
      ticket.status,
      user,
      internal,
      ticket.assigneeId !== null,
    );
    // Message + status change succeed or fail together.
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: { ticketId, authorId: user.id, body: dto.body, internal },
      }),
      // Always touched, even if the status is unchanged, so updatedAt reflects the last activity.
      this.prisma.ticket.update({ where: { id: ticketId }, data: { status } }),
    ]);
    return this.findOne(user, ticketId);
  }

  /** Staff only (enforced by @Roles on the controller). */
  async update(user: AuthUser, id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ConflictException('Ticket is closed');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
        select: { role: true },
      });
      if (!assignee || assignee.role === Role.CLIENT) {
        throw new BadRequestException('Assignee must be an agent or an admin');
      }
    }

    // Picking up a new ticket moves it to IN_PROGRESS unless a status is given explicitly.
    const status =
      dto.status ??
      (dto.assigneeId && ticket.status === TicketStatus.OPEN
        ? TicketStatus.IN_PROGRESS
        : undefined);

    await this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        priority: dto.priority,
        assigneeId: dto.assigneeId, // undefined = unchanged, null = unassign
      },
    });
    return this.findOne(user, id);
  }
}
