import type { TicketPriority, TicketStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Domain events: "something happened" facts published to RabbitMQ.
 * They are thin: they carry ids, not full objects. Consumers reload what they need
 * from the database, so they always act on fresh data and payloads stay small.
 * ticketAuthorId is included everywhere because the real-time layer needs it to
 * decide which browser receives the event.
 */
export interface EventPayloads {
  'ticket.created': { ticketId: string; ticketAuthorId: string };
  'message.created': {
    ticketId: string;
    ticketAuthorId: string;
    messageId: string;
    authorId: string;
    internal: boolean;
  };
  'ticket.updated': {
    ticketId: string;
    ticketAuthorId: string;
    actorId: string;
    changes: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string | null;
    };
  };
  'ticket.sla_breached': { ticketId: string; ticketAuthorId: string };
  'ticket.triaged': { ticketId: string; ticketAuthorId: string };
}

export type EventType = keyof EventPayloads;

/** Discriminated union: checking `event.type` narrows `event.data` to the right payload. */
export type DomainEvent<T extends EventType = EventType> = {
  [K in T]: {
    id: string; // unique per event: used as messageId and for consumer idempotency
    type: K; // also the RabbitMQ routing key
    occurredAt: string;
    data: EventPayloads[K];
  };
}[T];

export function createEvent<T extends EventType>(
  type: T,
  data: EventPayloads[T],
): DomainEvent<T> {
  return {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    data,
  } as DomainEvent<T>;
}
