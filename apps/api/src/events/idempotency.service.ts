import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * "Process each event at most once per consumer", on top of RabbitMQ's at-least-once delivery.
 * Usage: skip if alreadyProcessed(), do the side effect, then markProcessed().
 * If the process crashes between the side effect and markProcessed, the event is
 * handled again on redelivery: at-least-once, with duplicates made rare instead of routine.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async alreadyProcessed(eventId: string, consumer: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({
      where: { eventId_consumer: { eventId, consumer } },
    });
    return row !== null;
  }

  async markProcessed(eventId: string, consumer: string): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId, consumer } });
    } catch (e) {
      // Another worker instance finished the same event first: nothing to do.
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      ) {
        throw e;
      }
    }
  }
}
