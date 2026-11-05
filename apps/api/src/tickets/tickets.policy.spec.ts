import { Role, TicketStatus } from '@prisma/client';
import {
  isStaff,
  statusAfterReply,
  visibleTicketsWhere,
} from './tickets.policy.js';

const client = { id: 'c1', role: Role.CLIENT };
const agent = { id: 'a1', role: Role.AGENT };
const admin = { id: 'ad1', role: Role.ADMIN };

describe('tickets policy', () => {
  it('only agents and admins are staff', () => {
    expect(isStaff(client)).toBe(false);
    expect(isStaff(agent)).toBe(true);
    expect(isStaff(admin)).toBe(true);
  });

  it('restricts clients to their own tickets', () => {
    expect(visibleTicketsWhere(client)).toEqual({ authorId: 'c1' });
    expect(visibleTicketsWhere(agent)).toEqual({});
  });

  describe('statusAfterReply', () => {
    it('keeps the status on an internal note', () => {
      expect(statusAfterReply(TicketStatus.OPEN, agent, true, false)).toBe(
        TicketStatus.OPEN,
      );
    });

    it('waits for the customer after a public staff reply', () => {
      expect(statusAfterReply(TicketStatus.IN_PROGRESS, agent, false, true)).toBe(
        TicketStatus.WAITING_CUSTOMER,
      );
    });

    it('hands the ticket back to its agent when the client answers', () => {
      expect(
        statusAfterReply(TicketStatus.WAITING_CUSTOMER, client, false, true),
      ).toBe(TicketStatus.IN_PROGRESS);
    });

    it('reopens a resolved, unassigned ticket when the client answers', () => {
      expect(statusAfterReply(TicketStatus.RESOLVED, client, false, false)).toBe(
        TicketStatus.OPEN,
      );
    });

    it('leaves an open ticket open when the client adds details', () => {
      expect(statusAfterReply(TicketStatus.OPEN, client, false, false)).toBe(
        TicketStatus.OPEN,
      );
    });
  });
});
