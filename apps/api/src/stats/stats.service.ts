import { Inject, Injectable, Logger } from '@nestjs/common';
import { TicketPriority, TicketStatus } from '@prisma/client';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

export interface DashboardStats {
  byStatus: Record<TicketStatus, number>;
  openByPriority: Record<TicketPriority, number>;
  unassignedOpen: number;
  slaBreachedOpen: number;
  /** Average minutes to the first staff answer, tickets created in the last 30 days. */
  avgFirstResponseMinutes: number | null;
  /** Tickets created per day, last 14 days, oldest first, days without tickets included. */
  createdPerDay: { day: string; count: number }[];
  generatedAt: string;
}

const CACHE_KEY = 'stats:dashboard:v1';
const CACHE_TTL_SECONDS = 60;
const ACTIVE = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_CUSTOMER,
];

/**
 * Cache-aside: read Redis first; on a miss, run the aggregate queries and store the
 * result. Two ways out of the cache: the 60 s TTL (safety net), and invalidate(),
 * called on every ticket event so the dashboard is fresh right after a change.
 * The version in the key ("v1") lets a deploy change the shape without reading stale JSON.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async get(): Promise<DashboardStats & { cached: boolean }> {
    try {
      const hit = await this.redis.get(CACHE_KEY);
      if (hit) return { ...(JSON.parse(hit) as DashboardStats), cached: true };
    } catch (err) {
      // Redis down must not take the dashboard down: fall back to the database.
      this.logger.warn(`Cache read failed: ${(err as Error).message}`);
    }

    const stats = await this.compute();
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Cache write failed: ${(err as Error).message}`);
    }
    return { ...stats, cached: false };
  }

  async invalidate(): Promise<void> {
    try {
      await this.redis.del(CACHE_KEY);
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }
  }

  private async compute(): Promise<DashboardStats> {
    const [byStatusRows, byPriorityRows, unassignedOpen, slaBreachedOpen, avgRows, perDayRows] =
      await Promise.all([
        this.prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { status: { in: ACTIVE } },
          _count: { _all: true },
        }),
        this.prisma.ticket.count({
          where: { assigneeId: null, status: { in: ACTIVE } },
        }),
        this.prisma.ticket.count({
          where: { slaBreachedAt: { not: null }, status: { in: ACTIVE } },
        }),
        // Aggregations Prisma's query builder cannot express are written in SQL.
        // $queryRaw with a template literal sends parameters separately: no SQL injection.
        this.prisma.$queryRaw<{ minutes: number | null }[]>`
          SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60)::float AS minutes
          FROM "Ticket"
          WHERE "firstResponseAt" IS NOT NULL
            AND "createdAt" > NOW() - INTERVAL '30 days'`,
        // generate_series produces every day, so days with zero tickets still appear.
        this.prisma.$queryRaw<{ day: string; count: number }[]>`
          SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(t.id)::int AS count
          FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d(day)
          LEFT JOIN "Ticket" t ON t."createdAt"::date = d.day::date
          GROUP BY d.day
          ORDER BY d.day`,
      ]);

    const byStatus = Object.fromEntries(
      Object.values(TicketStatus).map((s) => [s, 0]),
    ) as Record<TicketStatus, number>;
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;

    const openByPriority = Object.fromEntries(
      Object.values(TicketPriority).map((p) => [p, 0]),
    ) as Record<TicketPriority, number>;
    for (const row of byPriorityRows) openByPriority[row.priority] = row._count._all;

    const minutes = avgRows[0]?.minutes;
    return {
      byStatus,
      openByPriority,
      unassignedOpen,
      slaBreachedOpen,
      avgFirstResponseMinutes: minutes == null ? null : Math.round(minutes),
      createdPerDay: perDayRows,
      generatedAt: new Date().toISOString(),
    };
  }
}
