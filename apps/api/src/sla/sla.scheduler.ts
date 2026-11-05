import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketStatus } from '@prisma/client';
import { EventPublisher } from '../events/event-publisher.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Runs in the worker every minute: flags tickets still waiting for a first answer
 * after SLA_FIRST_RESPONSE_MINUTES and publishes ticket.sla_breached.
 */
@Injectable()
export class SlaScheduler {
  private readonly logger = new Logger(SlaScheduler.name);
  private readonly slaMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventPublisher,
    config: ConfigService,
  ) {
    this.slaMinutes = Number(config.get('SLA_FIRST_RESPONSE_MINUTES', 60));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkBreaches(): Promise<number> {
    const deadline = new Date(Date.now() - this.slaMinutes * 60_000);
    const late = await this.prisma.ticket.findMany({
      where: {
        firstResponseAt: null,
        slaBreachedAt: null,
        status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
        createdAt: { lt: deadline },
      },
      select: { id: true, authorId: true },
      take: 100,
    });

    let flagged = 0;
    for (const ticket of late) {
      // Atomic claim: "set slaBreachedAt WHERE it is still null". If two worker instances
      // run this at the same time, only one gets count === 1, so the alert is sent once.
      const { count } = await this.prisma.ticket.updateMany({
        where: { id: ticket.id, slaBreachedAt: null },
        data: { slaBreachedAt: new Date() },
      });
      if (count === 1) {
        flagged++;
        await this.events.emit('ticket.sla_breached', {
          ticketId: ticket.id,
          ticketAuthorId: ticket.authorId,
        });
      }
    }
    if (flagged > 0) this.logger.warn(`${flagged} ticket(s) breached the SLA`);
    return flagged;
  }
}
