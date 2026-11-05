import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from './ai/ai.module.js';
import { TriageConsumer } from './ai/triage.consumer.js';
import { EventsModule } from './events/events.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SlaScheduler } from './sla/sla.scheduler.js';

/**
 * The worker: no HTTP server, only RabbitMQ consumers and scheduled jobs.
 * A separate process from the API, so slow jobs (SMTP, AI calls) never slow down
 * HTTP requests, and each side can be scaled on its own.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EventsModule,
    NotificationsModule,
    AiModule,
  ],
  providers: [SlaScheduler, TriageConsumer],
})
export class WorkerModule {}
