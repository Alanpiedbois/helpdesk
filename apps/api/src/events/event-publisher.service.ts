import { Injectable, Logger } from '@nestjs/common';
import {
  createEvent,
  type DomainEvent,
  type EventPayloads,
  type EventType,
} from './events.types.js';
import { RabbitMQService } from './rabbitmq.service.js';

/**
 * What business code calls after a successful database write.
 * A broker outage must not fail the user's request (the ticket is already saved),
 * so errors are logged, not thrown.
 *
 * Known trade-off: if the process crashes between the DB commit and the publish, the
 * event is lost. The production-grade fix is the transactional outbox pattern: write
 * the event to an "outbox" table in the same transaction, and relay it to RabbitMQ.
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private readonly rabbit: RabbitMQService) {}

  async emit<T extends EventType>(
    type: T,
    data: EventPayloads[T],
  ): Promise<void> {
    const event = createEvent(type, data);
    try {
      await this.rabbit.publish(event as DomainEvent);
    } catch (err) {
      this.logger.error(
        `Could not publish ${type} ${event.id}: ${(err as Error).message}`,
      );
    }
  }
}
