import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * GET /health: used by Docker, the hosting platform and CI to know the API is ready.
 * Returns 200 when every dependency answers, 503 otherwise.
 * Redis and RabbitMQ checks are added when those modules arrive.
 */
@Public() // probes from Docker or the host have no session
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
