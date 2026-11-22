import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();

beforeAll(async () => {
  await resetDatabase(ctx.db);
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
});
afterAll(() => ctx.close());

describe('login', () => {
  it('logs in, sets an HttpOnly cookie and returns permissions without secrets', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ username: 'owner', role: 'ADMIN' });
    expect(res.body.data.permissions).toContain('USER_MANAGE');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('stores only a hash of the session token', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send(ADMIN);
    const token = /sid=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';
    const sessions = await ctx.db.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).not.toBe(token);
    expect(sessions[0]?.tokenHash).toHaveLength(64);
  });

  it('gives the same generic error for wrong password and unknown user', async () => {
    const wrong = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN.username, password: 'nope-nope-nope' });
    const unknown = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: 'ghost', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ username: ADMIN.username, password: 'wrong-wrong-1' });
    }
    const res = await request(ctx.app).post('/api/v1/auth/login').send(ADMIN);
    expect(res.status).toBe(401);
    const user = await ctx.db.user.findUnique({ where: { username: ADMIN.username } });
    expect(user?.lockedUntil).not.toBeNull();
  });

  it('rejects malformed input with the validation error contract', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ username: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.requestId).toBeTruthy();
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('writes audit rows for success and failure without passwords', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ ...ADMIN, password: 'wrong-wrong-1' });
    await request(ctx.app).post('/api/v1/auth/login').send(ADMIN);
    const logs = await ctx.db.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_SUCCEEDED']);
    expect(JSON.stringify(logs)).not.toContain(ADMIN.password);
  });
});

describe('session', () => {
  it('returns 401 for /me without a cookie or with a forged cookie', async () => {
    expect((await request(ctx.app).get('/api/v1/auth/me')).status).toBe(401);
    const forged = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', 'sid=forged');
    expect(forged.status).toBe(401);
  });

  it('returns the current user and ends the session on logout', async () => {
    const agent = await loginAs(ctx.app, ADMIN);
    expect((await agent.get('/api/v1/auth/me')).body.data.username).toBe('owner');
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('saves the preferred language', async () => {
    const agent = await loginAs(ctx.app, STAFF);
    const res = await agent.patch('/api/v1/auth/me/preferences').send({ language: 'bn' });
    expect(res.body.data.language).toBe('bn');
    expect((await agent.get('/api/v1/auth/me')).body.data.language).toBe('bn');
  });

  it('blocks cross-origin state changes', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send(ADMIN);
    expect(res.status).toBe(403);
    const ok = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://app.example.test')
      .send(ADMIN);
    expect(ok.status).toBe(200);
  });

  it('changes the password and revokes other sessions', async () => {
    const first = await loginAs(ctx.app, STAFF);
    const second = await loginAs(ctx.app, STAFF);
    const res = await second
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: STAFF.password, newPassword: 'New-staff-pass-99' });
    expect(res.status).toBe(204);
    expect((await first.get('/api/v1/auth/me')).status).toBe(401);
    expect((await second.get('/api/v1/auth/me')).status).toBe(200);
    const relogin = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: STAFF.username, password: 'New-staff-pass-99' });
    expect(relogin.status).toBe(200);
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await request(ctx.app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(ctx.app).get('/health/ready')).body).toEqual({ status: 'ready' });
  });
});
