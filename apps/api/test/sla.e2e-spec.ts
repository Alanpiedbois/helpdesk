import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TicketStatus } from '@prisma/client';
import { EventPublisher } from '../src/events/event-publisher.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SlaScheduler } from '../src/sla/sla.scheduler.js';

// Real database, fake publisher: checks the SQL conditions and the "only once" guarantee.
describe('SlaScheduler (e2e)', () => {
  const run = Date.now();
  const emit = vi.fn();
  let prisma: PrismaService;
  let scheduler: SlaScheduler;
  let authorId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [SlaScheduler, { provide: EventPublisher, useValue: { emit } }],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    scheduler = moduleRef.get(SlaScheduler);
    const author = await prisma.user.create({
      data: { email: `sla.${run}@e2e.test`, name: 'SLA', passwordHash: 'x' },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { authorId } });
    await prisma.user.delete({ where: { id: authorId } });
  });

  const ticket = (hoursAgo: number, extra: object = {}) =>
    prisma.ticket.create({
      data: {
        subject: 'sla',
        authorId,
        createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
        ...extra,
      },
    });

  it('flags only late tickets without a first response, exactly once', async () => {
    const late = await ticket(3);
    const recent = await ticket(0);
    const answered = await ticket(3, { firstResponseAt: new Date() });
    const resolved = await ticket(3, { status: TicketStatus.RESOLVED });

    await scheduler.checkBreaches();
    const flaggedIds = emit.mock.calls.map(([, data]) => data.ticketId);
    expect(flaggedIds).toContain(late.id);
    for (const t of [recent, answered, resolved]) {
      expect(flaggedIds).not.toContain(t.id);
    }

    emit.mockClear();
    await scheduler.checkBreaches(); // second run: already flagged, no duplicate alert
    expect(emit.mock.calls.map(([, d]) => d.ticketId)).not.toContain(late.id);
  });
});
