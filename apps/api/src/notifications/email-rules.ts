import { Role, TicketStatus } from '@prisma/client';
import type { DomainEvent } from '../events/events.types.js';

/**
 * Who gets which e-mail for which event. Pure function: the consumer loads the data,
 * this decides, the mailer sends. Easy to read as a spec and to unit test.
 */
export interface Person {
  name: string;
  email: string;
}

export interface EmailContext {
  webOrigin: string;
  ticket: {
    id: string;
    subject: string;
    author: Person;
    assignee: (Person & { id: string }) | null;
  };
  /** Set for message.created only. */
  message?: { internal: boolean; authorRole: Role };
  /** Set for ticket.sla_breached only. */
  admins?: Person[];
}

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export function emailsFor(event: DomainEvent, ctx: EmailContext): Email[] {
  const { ticket } = ctx;
  const link = `${ctx.webOrigin}/tickets/${ticket.id}`;
  const ref = `« ${ticket.subject} »`;

  switch (event.type) {
    case 'ticket.created':
      return [
        {
          to: ticket.author.email,
          subject: `Demande reçue : ${ticket.subject}`,
          text: `Bonjour ${ticket.author.name},\n\nNous avons bien reçu votre demande ${ref}. Un agent vous répondra rapidement.\n\nSuivre votre ticket : ${link}`,
        },
      ];

    case 'message.created': {
      const message = ctx.message;
      if (!message || message.internal) return []; // internal notes never leave the team
      if (message.authorRole !== Role.CLIENT) {
        return [
          {
            to: ticket.author.email,
            subject: `Nouvelle réponse : ${ticket.subject}`,
            text: `Bonjour ${ticket.author.name},\n\nLe support a répondu à votre demande ${ref}.\n\nLire la réponse : ${link}`,
          },
        ];
      }
      if (!ticket.assignee) return []; // unassigned: the whole team sees it in the queue
      return [
        {
          to: ticket.assignee.email,
          subject: `Le client a répondu : ${ticket.subject}`,
          text: `${ticket.author.name} a répondu sur le ticket ${ref}.\n\n${link}`,
        },
      ];
    }

    case 'ticket.updated': {
      const emails: Email[] = [];
      const { changes, actorId } = event.data;
      // Assigned to someone else than the person who clicked: tell the new assignee.
      if (
        changes.assigneeId &&
        ticket.assignee &&
        changes.assigneeId !== actorId
      ) {
        emails.push({
          to: ticket.assignee.email,
          subject: `Ticket assigné : ${ticket.subject}`,
          text: `Le ticket ${ref} vous a été assigné.\n\n${link}`,
        });
      }
      if (changes.status === TicketStatus.RESOLVED) {
        emails.push({
          to: ticket.author.email,
          subject: `Demande résolue : ${ticket.subject}`,
          text: `Bonjour ${ticket.author.name},\n\nVotre demande ${ref} a été marquée comme résolue. Si le problème persiste, répondez simplement sur le ticket.\n\n${link}`,
        });
      }
      return emails;
    }

    case 'ticket.sla_breached':
      return (ctx.admins ?? []).map((admin) => ({
        to: admin.email,
        subject: `SLA dépassé : ${ticket.subject}`,
        text: `Le ticket ${ref} n'a pas reçu de première réponse dans les délais.\n\n${link}`,
      }));

    default:
      return [];
  }
}
