import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { DomainEvent } from '../events/events.types.js';
import { IdempotencyService } from '../events/idempotency.service.js';
import { RabbitMQService } from '../events/rabbitmq.service.js';
import { WORK_QUEUES } from '../events/topology.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { emailsFor, type EmailContext } from './email-rules.js';
import { MailerService } from './mailer.service.js';

const CONSUMER = 'notifications.email';

/** Runs in the worker process: turns domain events into e-mails. */
@Injectable()
export class NotificationsConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.rabbit.consume(WORK_QUEUES.email.name, (event) =>
      this.handle(event),
    );
  }

  async handle(event: DomainEvent): Promise<void> {
    if (await this.idempotency.alreadyProcessed(event.id, CONSUMER)) return;

    const ctx = await this.loadContext(event);
    if (ctx) {
      // Throwing here (e.g. SMTP down) triggers the retry / dead-letter flow.
      for (const email of emailsFor(event, ctx)) {
        await this.mailer.send(email);
      }
    }
    await this.idempotency.markProcessed(event.id, CONSUMER);
  }

  private async loadContext(event: DomainEvent): Promise<EmailContext | null> {
    const person = { select: { id: true, name: true, email: true } } as const;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: event.data.ticketId },
      select: { id: true, subject: true, author: person, assignee: person },
    });
    if (!ticket) return null; // deleted in the meantime: nothing to notify

    const ctx: EmailContext = {
      webOrigin: this.config.get('WEB_ORIGIN', 'http://localhost:5173'),
      ticket,
    };
    if (event.type === 'message.created') {
      const message = await this.prisma.message.findUnique({
        where: { id: event.data.messageId },
        select: { internal: true, author: { select: { role: true } } },
      });
      if (!message) return null;
      ctx.message = { internal: message.internal, authorRole: message.author.role };
    }
    if (event.type === 'ticket.sla_breached') {
      ctx.admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { name: true, email: true },
      });
    }
    return ctx;
  }
}
