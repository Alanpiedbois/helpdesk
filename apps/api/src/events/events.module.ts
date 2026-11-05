import { Global, Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { RabbitMQService } from './rabbitmq.service.js';

@Global()
@Module({
  providers: [RabbitMQService, EventPublisher, IdempotencyService],
  exports: [RabbitMQService, EventPublisher, IdempotencyService],
})
export class EventsModule {}
