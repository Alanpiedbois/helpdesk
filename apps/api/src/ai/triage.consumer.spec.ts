import Anthropic from '@anthropic-ai/sdk';
import type { EventPublisher } from '../events/event-publisher.service.js';
import { createEvent } from '../events/events.types.js';
import type { RabbitMQService } from '../events/rabbitmq.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LlmRefusalError, type LlmService } from './llm.service.js';
import { TriageConsumer } from './triage.consumer.js';

// No network: the LLM, the database and the publisher are fakes.
describe('TriageConsumer', () => {
  const event = createEvent('ticket.created', { ticketId: 't1', ticketAuthorId: 'c1' });
  let prisma: { ticket: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
  let llm: { enabled: boolean; triage: ReturnType<typeof vi.fn> };
  let emit: ReturnType<typeof vi.fn>;
  let consumer: TriageConsumer;

  beforeEach(() => {
    prisma = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({
          subject: 'Charged twice',
          authorId: 'c1',
          triagedAt: null,
          messages: [{ body: 'I paid twice this month' }],
        }),
        update: vi.fn(),
      },
    };
    llm = { enabled: true, triage: vi.fn() };
    emit = vi.fn();
    consumer = new TriageConsumer(
      {} as RabbitMQService,
      prisma as unknown as PrismaService,
      llm as unknown as LlmService,
      { emit } as unknown as EventPublisher,
    );
  });

  it('stores the suggestion and announces it', async () => {
    llm.triage.mockResolvedValue({ category: 'billing', priority: 'URGENT', summary: 'Double charge' });

    await consumer.handle(event);

    expect(llm.triage).toHaveBeenCalledWith('Charged twice', 'I paid twice this month');
    expect(prisma.ticket.update.mock.calls[0][0].data).toMatchObject({
      category: 'billing',
      aiSuggestedPriority: 'URGENT',
      aiSummary: 'Double charge',
    });
    expect(emit).toHaveBeenCalledWith('ticket.triaged', { ticketId: 't1', ticketAuthorId: 'c1' });
  });

  it('skips a ticket that was already triaged (redelivered message)', async () => {
    prisma.ticket.findUnique.mockResolvedValue({ triagedAt: new Date(), messages: [] });
    await consumer.handle(event);
    expect(llm.triage).not.toHaveBeenCalled();
  });

  it('gives up without retrying when the model refuses', async () => {
    llm.triage.mockRejectedValue(new LlmRefusalError('declined'));
    await consumer.handle(event); // does not throw -> message acked, no retry
    expect(prisma.ticket.update.mock.calls[0][0].data).toEqual({ triagedAt: expect.any(Date) });
  });

  it('rethrows transient errors so the queue retries later', async () => {
    llm.triage.mockRejectedValue(
      new Anthropic.APIConnectionError({ message: 'network down' }),
    );
    await expect(consumer.handle(event)).rejects.toThrow();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});
