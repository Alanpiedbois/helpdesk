import type { DomainEvent } from '../events/events.types.js';

/** Socket.IO rooms: every socket joins its user room, staff sockets also join "staff". */
export const STAFF_ROOM = 'staff';
export const userRoom = (userId: string) => `user:${userId}`;

/** What the browser receives: just enough to know which data to refetch, and who acted. */
export interface RealtimeMessage {
  type: DomainEvent['type'];
  ticketId: string;
  actorId: string | null;
}

/**
 * Which rooms receive an event. Pure function, unit tested: the security rule
 * "a client never learns about internal notes or other people's tickets" lives here.
 */
export function audienceFor(event: DomainEvent): string[] {
  const staffOnly = [STAFF_ROOM];
  const staffAndAuthor = [STAFF_ROOM, userRoom(event.data.ticketAuthorId)];

  switch (event.type) {
    case 'message.created':
      return event.data.internal ? staffOnly : staffAndAuthor;
    case 'ticket.created':
    case 'ticket.updated':
      return staffAndAuthor;
    case 'ticket.sla_breached':
    case 'ticket.triaged':
      return staffOnly; // internal workflow information
    default:
      return staffOnly;
  }
}

export function toRealtimeMessage(event: DomainEvent): RealtimeMessage {
  let actorId: string | null = null;
  if (event.type === 'message.created') actorId = event.data.authorId;
  else if (event.type === 'ticket.created') actorId = event.data.ticketAuthorId;
  else if (event.type === 'ticket.updated') actorId = event.data.actorId;
  return { type: event.type, ticketId: event.data.ticketId, actorId };
}
