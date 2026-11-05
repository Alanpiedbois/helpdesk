import { Role, TicketStatus } from '@prisma/client';
import { createEvent } from '../events/events.types.js';
import { emailsFor, type EmailContext } from './email-rules.js';

const ctx: EmailContext = {
  webOrigin: 'http://app.test',
  ticket: {
    id: 't1',
    subject: 'Export broken',
    author: { name: 'Nina', email: 'nina@client.test' },
    assignee: { id: 'a1', name: 'Léa', email: 'lea@support.test' },
  },
};
const base = { ticketId: 't1', ticketAuthorId: 'c1' };
const recipients = (emails: { to: string }[]) => emails.map((e) => e.to);

describe('emailsFor', () => {
  it('confirms a new ticket to its author, with a link', () => {
    const emails = emailsFor(createEvent('ticket.created', base), ctx);
    expect(recipients(emails)).toEqual(['nina@client.test']);
    expect(emails[0].text).toContain('http://app.test/tickets/t1');
  });

  const message = (internal: boolean, authorRole: Role) =>
    emailsFor(
      createEvent('message.created', {
        ...base,
        messageId: 'm1',
        authorId: 'x',
        internal,
      }),
      { ...ctx, message: { internal, authorRole } },
    );

  it('never e-mails internal notes', () => {
    expect(message(true, Role.AGENT)).toEqual([]);
  });

  it('tells the client when the support answers', () => {
    expect(recipients(message(false, Role.AGENT))).toEqual(['nina@client.test']);
  });

  it('tells the assignee when the client answers', () => {
    expect(recipients(message(false, Role.CLIENT))).toEqual(['lea@support.test']);
  });

  it('does not e-mail anyone when the client answers an unassigned ticket', () => {
    const emails = emailsFor(
      createEvent('message.created', { ...base, messageId: 'm1', authorId: 'c1', internal: false }),
      { ...ctx, ticket: { ...ctx.ticket, assignee: null }, message: { internal: false, authorRole: Role.CLIENT } },
    );
    expect(emails).toEqual([]);
  });

  it('notifies a new assignee, but not when agents assign themselves', () => {
    const update = (actorId: string) =>
      emailsFor(
        createEvent('ticket.updated', { ...base, actorId, changes: { assigneeId: 'a1' } }),
        ctx,
      );
    expect(recipients(update('admin1'))).toEqual(['lea@support.test']);
    expect(update('a1')).toEqual([]);
  });

  it('tells the client when the ticket is resolved', () => {
    const emails = emailsFor(
      createEvent('ticket.updated', { ...base, actorId: 'a1', changes: { status: TicketStatus.RESOLVED } }),
      ctx,
    );
    expect(recipients(emails)).toEqual(['nina@client.test']);
  });

  it('alerts every admin on an SLA breach', () => {
    const emails = emailsFor(createEvent('ticket.sla_breached', base), {
      ...ctx,
      admins: [
        { name: 'A', email: 'a@x.test' },
        { name: 'B', email: 'b@x.test' },
      ],
    });
    expect(recipients(emails)).toEqual(['a@x.test', 'b@x.test']);
  });
});
