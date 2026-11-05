import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// End-to-end: real HTTP requests against the real app and the Docker Postgres.
// Emails are unique per run, so the tests never collide with existing data.
const run = Date.now();
const email = (name: string) => `${name}.${run}@e2e.test`;
const password = 'correct-horse-battery';

describe('Auth & roles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@e2e.test` } } });
    await app.close();
  });

  it('register sets an httpOnly session cookie and never returns the hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email('client'), name: 'Client', password })
      .expect(201);

    expect(res.body.role).toBe(Role.CLIENT);
    expect(res.body).not.toHaveProperty('passwordHash');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^access_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('register refuses a client trying to give itself a role', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email('sneaky'), name: 'Sneaky', password, role: 'ADMIN' })
      .expect(400);
  });

  it('register refuses a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email('client'), name: 'Again', password })
      .expect(409);
  });

  it('login + /auth/me works with the cookie, and logout ends the session', async () => {
    const agent = request.agent(app.getHttpServer()); // keeps cookies between requests

    await agent.post('/auth/login').send({ email: email('client'), password }).expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.email).toBe(email('client'));

    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
  });

  it('login fails with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email('client'), password: 'wrong-password' })
      .expect(401);
  });

  it('protected routes answer 401 without a session', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('admin routes answer 403 to a client and 200 to an admin', async () => {
    const client = request.agent(app.getHttpServer());
    await client.post('/auth/login').send({ email: email('client'), password }).expect(200);
    await client.get('/users').expect(403);

    // Promote a fresh account to ADMIN directly in the database, then log in as it.
    const admin = request.agent(app.getHttpServer());
    await admin
      .post('/auth/register')
      .send({ email: email('admin'), name: 'Admin', password })
      .expect(201);
    await prisma.user.update({ where: { email: email('admin') }, data: { role: Role.ADMIN } });
    await admin.post('/auth/login').send({ email: email('admin'), password }).expect(200);

    await admin.get('/users').expect(200);

    // The admin promotes the client to agent.
    const target = await prisma.user.findUniqueOrThrow({ where: { email: email('client') } });
    const res = await admin
      .patch(`/users/${target.id}/role`)
      .send({ role: Role.AGENT })
      .expect(200);
    expect(res.body.role).toBe(Role.AGENT);
  });
});
