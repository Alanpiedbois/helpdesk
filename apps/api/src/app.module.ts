import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigController } from './config/config.controller.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StatsModule } from './stats/stats.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Loads apps/api/.env into process.env and exposes ConfigService everywhere.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    EventsModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    StatsModule,
    RealtimeModule,
    HealthModule,
    AiModule,
  ],
  controllers: [ConfigController],
})
export class AppModule {}
