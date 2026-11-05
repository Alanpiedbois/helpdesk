import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [AuthModule, StatsModule], // AuthModule re-exports JwtModule for token checks
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
