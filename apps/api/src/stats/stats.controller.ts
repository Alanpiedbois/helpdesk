import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators.js';
import { StatsService } from './stats.service.js';

@Roles(Role.AGENT, Role.ADMIN)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  get() {
    return this.stats.get();
  }
}
