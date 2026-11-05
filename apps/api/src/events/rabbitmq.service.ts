import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { DomainEvent } from './events.types.js';
import {
  assertTopology,
  EVENTS_EXCHANGE,
  failureAction,
  type WorkQueue,
} from './topology.js';

export type EventHandler = (event: DomainEvent) => Promise<void>;

/**
 * Owns the RabbitMQ connection. amqp-connection-manager reconnects automatically
 * and re-runs each channel's setup (topology, consumers) after a reconnect.
 */
@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: AmqpConnectionManager;
  private publisher: ChannelWrapper;
  private readonly consumers: ChannelWrapper[] = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.connection = amqp.connect([
      this.config.getOrThrow<string>('RABBITMQ_URL'),
    ]);
    this.connection.on('connect', () => this.logger.log('Connected'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`Disconnected: ${err?.message}`),
    );

    // Confirm channel: publish() resolves only once the broker has taken the message.
    this.publisher = this.connection.createChannel({
      name: 'publisher',
      json: true,
      setup: (ch: ConfirmChannel) => assertTopology(ch),
    });
    await this.publisher.waitForConnect();
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map((c) => c.close()));
    await this.publisher?.close();
    await this.connection?.close();
  }

  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /** Publishes to the topic exchange; the event type is the routing key. */
  async publish(event: DomainEvent): Promise<void> {
    await this.publisher.publish(EVENTS_EXCHANGE, event.type, event, {
      persistent: true, // written to disk by the broker, survives a restart
      messageId: event.id,
      contentType: 'application/json',
      timeout: 5_000,
    });
  }

  /**
   * Consumes a durable work queue with manual acks:
   * success -> ack; failure -> retry queue, then dead-letter queue after MAX_ATTEMPTS.
   * prefetch caps how many unacknowledged messages this consumer holds at once.
   */
  async consume(
    queue: WorkQueue,
    handler: EventHandler,
    prefetch = 5,
  ): Promise<void> {
    const channel = this.connection.createChannel({
      name: `consumer:${queue}`,
      json: true,
      setup: (ch: ConfirmChannel) => assertTopology(ch),
    });
    this.consumers.push(channel);
    await channel.waitForConnect();
    await channel.consume(
      queue,
      (msg) => void this.handle(channel, queue, msg, handler),
      { prefetch },
    );
    this.logger.log(`Consuming ${queue}`);
  }

  /**
   * Fan-out style subscription for one process: a temporary, exclusive queue that
   * RabbitMQ deletes when the connection closes. Every API instance gets its own copy
   * of each event (used to push events to that instance's WebSocket clients).
   * No retries: a missed real-time push is harmless, the page refetches on focus.
   */
  async subscribe(bindingKeys: string[], handler: EventHandler): Promise<void> {
    const queue = `realtime.${hostname()}.${process.pid}.${randomUUID().slice(0, 8)}`;
    const channel = this.connection.createChannel({
      name: `subscriber:${queue}`,
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await assertTopology(ch);
        await ch.assertQueue(queue, { exclusive: true, autoDelete: true });
        for (const key of bindingKeys) {
          await ch.bindQueue(queue, EVENTS_EXCHANGE, key);
        }
      },
    });
    this.consumers.push(channel);
    await channel.waitForConnect();
    await channel.consume(
      queue,
      async (msg) => {
        try {
          await handler(JSON.parse(msg.content.toString()) as DomainEvent);
        } catch (err) {
          this.logger.error(`Subscriber failed: ${(err as Error).message}`);
        }
      },
      { noAck: true },
    );
  }

  private async handle(
    channel: ChannelWrapper,
    queue: WorkQueue,
    msg: ConsumeMessage,
    handler: EventHandler,
  ): Promise<void> {
    let event: DomainEvent;
    try {
      event = JSON.parse(msg.content.toString()) as DomainEvent;
    } catch {
      // Unparseable ("poison") message: retrying cannot help, dead-letter it now.
      this.logger.error(`Invalid JSON on ${queue}, dead-lettering`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      await handler(event);
      channel.ack(msg);
    } catch (err) {
      const attempt = Number(msg.properties.headers?.['x-attempt'] ?? 1);
      const action = failureAction(attempt);
      this.logger.warn(
        `${event.type} ${event.id} failed on ${queue} (attempt ${attempt}): ${(err as Error).message} -> ${action}`,
      );
      if (action === 'retry') {
        try {
          // Copy into the retry queue with the attempt counter, wait for the broker's
          // confirm, and only then ack the original: the message is never lost in between.
          await channel.sendToQueue(`${queue}.retry`, event, {
            persistent: true,
            messageId: msg.properties.messageId as string | undefined,
            headers: { ...msg.properties.headers, 'x-attempt': attempt + 1 },
          });
          channel.ack(msg);
        } catch {
          channel.nack(msg, false, true); // could not schedule a retry: put it back
        }
      } else {
        channel.nack(msg, false, false); // requeue=false -> dead-letter exchange -> .dlq
      }
    }
  }
}
