import { createEvent } from '../events/events.types.js';
import { audienceFor, STAFF_ROOM, toRealtimeMessage, userRoom } from './audience.js';

const base = { ticketId: 't1', ticketAuthorId: 'client1' };

describe('audienceFor', () => {
  it('sends ticket activity to staff and to the ticket author only', () => {
    expect(audienceFor(createEvent('ticket.created', base))).toEqual([
      STAFF_ROOM,
      userRoom('client1'),
    ]);
  });

  it('keeps internal notes away from the client', () => {
    const note = createEvent('message.created', {
      ...base,
      messageId: 'm1',
      authorId: 'agent1',
      internal: true,
    });
    expect(audienceFor(note)).toEqual([STAFF_ROOM]);
  });

  it('sends public replies to the client too', () => {
    const reply = createEvent('message.created', {
      ...base,
      messageId: 'm1',
      authorId: 'agent1',
      internal: false,
    });
    expect(audienceFor(reply)).toContain(userRoom('client1'));
  });

  it('keeps SLA alerts internal', () => {
    expect(audienceFor(createEvent('ticket.sla_breached', base))).toEqual([STAFF_ROOM]);
  });
});

describe('toRealtimeMessage', () => {
  it('exposes the actor so the UI can skip notifying people about their own actions', () => {
    const event = createEvent('ticket.updated', { ...base, actorId: 'agent1', changes: {} });
    expect(toRealtimeMessage(event)).toEqual({
      type: 'ticket.updated',
      ticketId: 't1',
      actorId: 'agent1',
    });
  });
});
