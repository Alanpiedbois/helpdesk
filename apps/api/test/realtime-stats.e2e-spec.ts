import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { RealtimeMessage } from '../src/realtime/audience.js';

const run = Date.now();
const email = (name: string) => `${name}.${run}@rt.e2e.test`;
const password = 'correct-horse-battery';

/** Records every event a socket receives, to assert on them after the fact. */
function record(socket: Socket): RealtimeMessage[] {
  const received: RealtimeMessage[] = [];
  socket.on('ticket.event', (m: RealtimeMessage) => received.push(m));
  return received;
}

/** Polls until the predicate holds (events arrive asynchronously through RabbitMQ). */
async function eventually(check: () => boolean, ms = 5_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Real-time + stats (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  const sockets: Socket[] = [];

  async function account(name: string, role: Role = Role.CLIENT) {
    const session = request.agent(app.getHttpServer());
    const res = await session.post('/auth/register').send({ email: email(name), name, password });
    let cookie = res.headers['set-cookie'][0].split(';')[0];
    if (role !== Role.CLIENT) {
      await prisma.user.update({ where: { id: res.body.id }, data: { role } });
      const login = await session.post('/auth/login').send({ email: email(name), password });
      cookie = login.headers['set-cookie'][0].split(';')[0];
    }
    return { session, cookie, id: res.body.id as string };
  }

  function connect(cookie?: string): Socket {
    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: cookie ? { Cookie: cookie } : {},
    });
    sockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0); // random free port: WebSockets need a real server
    url = await app.getUrl();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    const users = { email: { endsWith: `.${run}@rt.e2e.test` } };
    await prisma.ticket.deleteMany({ where: { author: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('reports database, Redis and RabbitMQ as up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.info).toMatchObject({
      database: { status: 'up' },
      redis: { status: 'up' },
      rabbitmq: { status: 'up' },
    });
  });

  it('refuses a WebSocket without a session', async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));
  });

  it('pushes a new ticket to staff and its author, but not to other clients', async () => {
    const author = await account('author');
    const other = await account('other');
    const agent = await account('agent', Role.AGENT);

    const authorSocket = connect(author.cookie);
    const otherSocket = connect(other.cookie);
    const agentSocket = connect(agent.cookie);
    await Promise.all(
      [authorSocket, otherSocket, agentSocket].map(
        (s) => new Promise<void>((resolve) => s.on('connect', () => resolve())),
      ),
    );

    const forAuthor = record(authorSocket);
    const forOther = record(otherSocket);
    const forAgent = record(agentSocket);

    const created = await author.session
      .post('/tickets')
      .send({ subject: 'Live?', body: 'Real-time test' })
      .expect(201);
    const isThisTicket = (m: RealtimeMessage) =>
      m.type === 'ticket.created' && m.ticketId === created.body.id;

    await eventually(() => forAgent.some(isThisTicket) && forAuthor.some(isThisTicket));
    expect(forAuthor.find(isThisTicket)?.actorId).toBe(author.id);
    await new Promise((r) => setTimeout(r, 300)); // leave time for a wrong delivery to show up
    expect(forOther.some(isThisTicket)).toBe(false);
  });

  it('serves stats to staff from the Redis cache, and refreshes it after a change', async () => {
    const agent = await account('statsagent', Role.AGENT);
    const client = await account('statsclient');
    await client.session.get('/stats').expect(403);

    await agent.session.get('/stats').expect(200);
    const cached = await agent.session.get('/stats').expect(200);
    expect(cached.body.cached).toBe(true);
    expect(cached.body.createdPerDay).toHaveLength(14);

    // A ticket event invalidates the cache (via RabbitMQ -> gateway), so the next read recomputes.
    const before = cached.body.byStatus.OPEN as number;
    await client.session.post('/tickets').send({ subject: 'Stats', body: 'x' }).expect(201);
    let after = before;
    for (let i = 0; i < 20 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 100));
      after = (await agent.session.get('/stats')).body.byStatus.OPEN;
    }
    expect(after).toBe(before + 1);
  });
});
