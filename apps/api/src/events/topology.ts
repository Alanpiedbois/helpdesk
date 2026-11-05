import type { ConfirmChannel } from 'amqplib';

/**
 * RabbitMQ topology, declared by code at startup (idempotent: asserting what already
 * exists is a no-op). Anyone reading this file sees the whole message flow:
 *
 *   API ──publish──► exchange "helpdesk.events" (topic)
 *                       ├─ ticket.created, message.created, ... ─► queue notifications.email
 *                       ├─ ticket.created ──────────────────────► queue ai.triage
 *                       └─ ticket.#  (one temporary queue per API instance) ─► WebSocket
 *
 * A failed message goes to "<queue>.retry", waits RETRY_DELAY_MS there (message TTL),
 * then is dead-lettered back into "<queue>". After MAX_ATTEMPTS it lands in "<queue>.dlq"
 * for a human to inspect, instead of looping forever.
 */
export const EVENTS_EXCHANGE = 'helpdesk.events';
export const DEAD_LETTER_EXCHANGE = 'helpdesk.dlx';
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 5_000;

export const WORK_QUEUES = {
  email: {
    name: 'notifications.email',
    bindings: [
      'ticket.created',
      'message.created',
      'ticket.updated',
      'ticket.sla_breached',
    ],
  },
  aiTriage: {
    name: 'ai.triage',
    bindings: ['ticket.created'],
  },
} as const;

export type WorkQueue = (typeof WORK_QUEUES)[keyof typeof WORK_QUEUES]['name'];

export async function assertTopology(ch: ConfirmChannel): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });

  for (const queue of Object.values(WORK_QUEUES)) {
    // Main queue: durable (survives a broker restart); rejected messages go to the DLX.
    await ch.assertQueue(queue.name, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: `${queue.name}.dlq`,
    });
    for (const key of queue.bindings) {
      await ch.bindQueue(queue.name, EVENTS_EXCHANGE, key);
    }

    // Retry queue: nobody consumes it. Messages expire after the TTL and are
    // dead-lettered through the default exchange ("") straight back to the main queue.
    await ch.assertQueue(`${queue.name}.retry`, {
      durable: true,
      messageTtl: RETRY_DELAY_MS,
      deadLetterExchange: '',
      deadLetterRoutingKey: queue.name,
    });

    // Dead-letter queue: final parking spot for messages that keep failing.
    await ch.assertQueue(`${queue.name}.dlq`, { durable: true });
    await ch.bindQueue(
      `${queue.name}.dlq`,
      DEAD_LETTER_EXCHANGE,
      `${queue.name}.dlq`,
    );
  }
}

/** What to do with a message whose handler threw, given how many times it was tried. */
export function failureAction(attempt: number): 'retry' | 'dead-letter' {
  return attempt < MAX_ATTEMPTS ? 'retry' : 'dead-letter';
}
