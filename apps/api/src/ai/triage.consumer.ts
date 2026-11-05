import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ZodError } from 'zod/v4';
import { EventPublisher } from '../events/event-publisher.service.js';
import type { DomainEvent } from '../events/events.types.js';
import { RabbitMQService } from '../events/rabbitmq.service.js';
import { WORK_QUEUES } from '../events/topology.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmRefusalError, LlmService } from './llm.service.js';

/**
 * Worker side: every new ticket goes through the ai.triage queue.
 * Asynchronous on purpose: an LLM call takes seconds, the client should not wait for it.
 */
@Injectable()
export class TriageConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(TriageConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly events: EventPublisher,
  ) {}

  async onApplicationBootstrap() {
    if (!this.llm.enabled) return; // no API key: messages wait in the queue until enabled
    // prefetch 2: at most two LLM calls in flight per worker, to respect rate limits.
    await this.rabbit.consume(WORK_QUEUES.aiTriage.name, (e) => this.handle(e), 2);
  }

  async handle(event: DomainEvent): Promise<void> {
    if (event.type !== 'ticket.created') return;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: event.data.ticketId },
      select: {
        subject: true,
        authorId: true,
        triagedAt: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { body: true } },
      },
    });
    // Idempotent: already triaged (redelivery) or deleted -> nothing to do.
    if (!ticket || ticket.triagedAt) return;

    try {
      const triage = await this.llm.triage(ticket.subject, ticket.messages[0]?.body ?? '');
      await this.prisma.ticket.update({
        where: { id: event.data.ticketId },
        data: {
          category: triage.category,
          aiSummary: triage.summary,
          aiSuggestedPriority: triage.priority,
          triagedAt: new Date(),
        },
      });
    } catch (err) {
      // Errors that a retry cannot fix: record that triage was attempted and move on.
      // Anything else (rate limit, network, 5xx) is rethrown -> retry queue -> DLQ.
      const permanent =
        err instanceof LlmRefusalError ||
        err instanceof ZodError ||
        err instanceof SyntaxError ||
        err instanceof Anthropic.BadRequestError;
      if (!permanent) throw err;
      this.logger.warn(`Triage skipped for ${event.data.ticketId}: ${(err as Error).message}`);
      await this.prisma.ticket.update({
        where: { id: event.data.ticketId },
        data: { triagedAt: new Date() },
      });
    }

    await this.events.emit('ticket.triaged', {
      ticketId: event.data.ticketId,
      ticketAuthorId: ticket.authorId,
    });
  }
}
