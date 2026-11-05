import { Prisma, Role, TicketStatus } from '@prisma/client';
import type { AuthUser } from '../auth/decorators.js';

// Business rules as pure functions: no database, no Nest, so they are trivial to unit test
// and the service stays focused on data access.

export function isStaff(user: AuthUser): boolean {
  return user.role === Role.AGENT || user.role === Role.ADMIN;
}

/**
 * Row-level access: a client only ever sees their own tickets, staff see all.
 * Every query on tickets goes through this filter, so a forgotten check cannot leak data.
 */
export function visibleTicketsWhere(user: AuthUser): Prisma.TicketWhereInput {
  return isStaff(user) ? {} : { authorId: user.id };
}

/**
 * Status after someone posts a message:
 * - internal note: no change, the client does not know about it;
 * - staff public reply: waiting for the client;
 * - client reply on a ticket waiting for them (or resolved): back to the agents.
 */
export function statusAfterReply(
  current: TicketStatus,
  author: AuthUser,
  internal: boolean,
  hasAssignee: boolean,
): TicketStatus {
  if (internal) return current;
  if (isStaff(author)) return TicketStatus.WAITING_CUSTOMER;
  if (
    current === TicketStatus.WAITING_CUSTOMER ||
    current === TicketStatus.RESOLVED
  ) {
    return hasAssignee ? TicketStatus.IN_PROGRESS : TicketStatus.OPEN;
  }
  return current;
}
