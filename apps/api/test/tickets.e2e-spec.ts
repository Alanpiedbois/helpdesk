import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, TicketStatus } from '@prisma/client';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent.js';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const run = Date.now();
const email = (name: string) => `${name}.${run}@tickets.e2e.test`;
const password = 'correct-horse-battery';

describe('Tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let alice: TestAgent; // client
  let bob: TestAgent; // another client
  let agent: TestAgent;
  let agentId: string;
  let aliceId: string;
  let ticketId: string;

  /** Registers an account, optionally changes its role in the DB, and returns a logged-in agent. */
  async function login(name: string, role: Role = Role.CLIENT) {
    const session = request.agent(app.getHttpServer());
    const res = await session
      .post('/auth/register')
      .send({ email: email(name), name, password })
      .expect(201);
    if (role !== Role.CLIENT) {
      await prisma.user.update({ where: { id: res.body.id }, data: { role } });
      await session.post('/auth/login').send({ email: email(name), password }).expect(200);
    }
    return { session, id: res.body.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    ({ session: alice, id: aliceId } = await login('alice'));
    ({ session: bob } = await login('bob'));
    ({ session: agent, id: agentId } = await login('agent', Role.AGENT));
  });

  afterAll(async () => {
    const users = { email: { endsWith: `.${run}@tickets.e2e.test` } };
    await prisma.ticket.deleteMany({ where: { author: users } }); // messages cascade
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('a client opens a ticket with a first message', async () => {
    const res = await alice
      .post('/tickets')
      .send({ subject: 'Cannot export invoices', body: 'The export button does nothing.' })
      .expect(201);

    ticketId = res.body.id;
    expect(res.body.status).toBe(TicketStatus.OPEN);
    expect(res.body.author.id).toBe(aliceId);
    expect(res.body.messages).toHaveLength(1);
  });

  it('another client can neither read nor list it (404, not 403)', async () => {
    await bob.get(`/tickets/${ticketId}`).expect(404);
    const list = await bob.get('/tickets').expect(200);
    expect(list.body.items.map((t: { id: string }) => t.id)).not.toContain(ticketId);
  });

  it('a client cannot update a ticket or write internal notes', async () => {
    await alice.patch(`/tickets/${ticketId}`).send({ status: 'RESOLVED' }).expect(403);
    await alice
      .post(`/tickets/${ticketId}/messages`)
      .send({ body: 'hidden?', internal: true })
      .expect(403);
  });

  it('the ticket shows up in the unassigned queue', async () => {
    const res = await agent.get('/tickets?assigned=none&pageSize=100').expect(200);
    expect(res.body.items.map((t: { id: string }) => t.id)).toContain(ticketId);
  });

  it('an agent cannot assign a ticket to a client', async () => {
    await agent.patch(`/tickets/${ticketId}`).send({ assigneeId: aliceId }).expect(400);
  });

  it('assigning an open ticket moves it to IN_PROGRESS', async () => {
    const res = await agent
      .patch(`/tickets/${ticketId}`)
      .send({ assigneeId: agentId })
      .expect(200);
    expect(res.body.assignee.id).toBe(agentId);
    expect(res.body.status).toBe(TicketStatus.IN_PROGRESS);

    const mine = await agent.get('/tickets?assigned=me').expect(200);
    expect(mine.body.items.map((t: { id: string }) => t.id)).toContain(ticketId);
  });

  it('internal notes are visible to staff only', async () => {
    await agent
      .post(`/tickets/${ticketId}/messages`)
      .send({ body: 'Probably the CSV bug from last week', internal: true })
      .expect(201);

    const forAgent = await agent.get(`/tickets/${ticketId}`).expect(200);
    const forClient = await alice.get(`/tickets/${ticketId}`).expect(200);
    expect(forAgent.body.messages).toHaveLength(2);
    expect(forClient.body.messages).toHaveLength(1);
    expect(forClient.body.status).toBe(TicketStatus.IN_PROGRESS); // a note changes nothing
  });

  it('replies move the ticket between the agent and the client', async () => {
    const afterAgent = await agent
      .post(`/tickets/${ticketId}/messages`)
      .send({ body: 'Which browser do you use?' })
      .expect(201);
    expect(afterAgent.body.status).toBe(TicketStatus.WAITING_CUSTOMER);

    const afterClient = await alice
      .post(`/tickets/${ticketId}/messages`)
      .send({ body: 'Firefox 140.' })
      .expect(201);
    expect(afterClient.body.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('paginates and reports the total', async () => {
    await alice.post('/tickets').send({ subject: 'Second ticket', body: 'Details' }).expect(201);
    const res = await alice.get('/tickets?pageSize=1&page=2').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(2);
  });

  it('rejects invalid query parameters', async () => {
    await alice.get('/tickets?pageSize=1000').expect(400);
    await alice.get('/tickets?status=NOPE').expect(400);
  });

  it('keeps AI suggestions away from clients', async () => {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { aiSummary: 'Internal summary', aiSuggestedPriority: 'HIGH', category: 'bug' },
    });
    const forClient = await alice.get(`/tickets/${ticketId}`).expect(200);
    const forAgent = await agent.get(`/tickets/${ticketId}`).expect(200);
    expect(forClient.body.aiSummary).toBeNull();
    expect(forClient.body.aiSuggestedPriority).toBeNull();
    expect(forAgent.body.aiSummary).toBe('Internal summary');
  });

  it('reply drafts are staff only, and 503 when no API key is configured', async () => {
    await alice.post(`/tickets/${ticketId}/suggest-reply`).expect(403);
    if (!process.env.ANTHROPIC_API_KEY) {
      await agent.post(`/tickets/${ticketId}/suggest-reply`).expect(503);
    }
  });

  it('a closed ticket accepts no more replies or changes', async () => {
    await agent.patch(`/tickets/${ticketId}`).send({ status: 'CLOSED' }).expect(200);
    await alice.post(`/tickets/${ticketId}/messages`).send({ body: 'One more thing' }).expect(409);
    await agent.patch(`/tickets/${ticketId}`).send({ priority: 'HIGH' }).expect(409);
  });
});
