import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { Public } from '../auth/decorators.js';
import { RabbitMQService } from '../events/rabbitmq.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * GET /health: used by Docker, the hosting platform and CI to know the API is ready.
 * Returns 200 when every dependency answers, 503 otherwise.
 */
@Public() // probes from Docker or the host have no session
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMQService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      async () => {
        const indicator = this.indicators.check('redis');
        try {
          await this.redis.ping();
          return indicator.up();
        } catch (err) {
          return indicator.down({ message: (err as Error).message });
        }
      },
      () => {
        const indicator = this.indicators.check('rabbitmq');
        return this.rabbit.isConnected() ? indicator.up() : indicator.down();
      },
    ]);
  }
}
