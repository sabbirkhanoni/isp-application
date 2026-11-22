import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
});
afterAll(() => ctx.close());

const newStaff = {
  username: 'field2',
  fullName: 'Field Two',
  role: 'STAFF',
  temporaryPassword: 'Temp-password-123',
};

describe('RBAC on admin user management', () => {
  const adminOnly: Array<[string, string, object?]> = [
    ['get', '/api/v1/admin/users'],
    ['post', '/api/v1/admin/users', newStaff],
    ['get', '/api/v1/admin/users/00000000-0000-0000-0000-000000000000'],
    ['patch', '/api/v1/admin/users/00000000-0000-0000-0000-000000000000', { status: 'DISABLED' }],
    [
      'post',
      '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/reset-password',
      { temporaryPassword: 'Temp-password-123' },
    ],
  ];

  it.each(adminOnly)('rejects anonymous %s %s with 401', async (method, url, body) => {
    const res = await (request(ctx.app) as never as Record<string, (u: string) => request.Test>)[
      method
    ]!(url).send(body);
    expect(res.status).toBe(401);
  });

  it.each(adminOnly)(
    'rejects STAFF on %s %s with 403 and leaks nothing',
    async (method, url, body) => {
      const agent = await loginAs(ctx.app, STAFF);
      const res = await (agent as never as Record<string, (u: string) => request.Test>)[method]!(
        url,
      ).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.data).toBeUndefined();
    },
  );

  it('audits denied attempts', async () => {
    const agent = await loginAs(ctx.app, STAFF);
    await agent.get('/api/v1/admin/users');
    const denied = await ctx.db.auditLog.findMany({ where: { action: 'AUTH_PERMISSION_DENIED' } });
    expect(denied).toHaveLength(1);
    expect(denied[0]?.outcome).toBe('DENIED');
  });
});

describe('user management by admin', () => {
  it('creates a staff user who must change the temporary password before using protected routes', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const created = await admin.post('/api/v1/admin/users').send(newStaff);
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/password/i);

    const staff = await loginAs(ctx.app, { username: 'field2', password: 'Temp-password-123' });
    expect((await staff.get('/api/v1/auth/me')).body.data.mustChangePassword).toBe(true);
    const blocked = await staff.get('/api/v1/admin/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rejects duplicate usernames', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin
      .post('/api/v1/admin/users')
      .send({ ...newStaff, username: STAFF.username });
    expect(res.status).toBe(409);
  });

  it('disabling a user revokes their sessions immediately and blocks new logins', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const staff = await loginAs(ctx.app, STAFF);
    const staffUser = await ctx.db.user.findUniqueOrThrow({ where: { username: STAFF.username } });

    const res = await admin
      .patch(`/api/v1/admin/users/${staffUser.id}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(200);
    expect((await staff.get('/api/v1/auth/me')).status).toBe(401);
    const relogin = await request(ctx.app).post('/api/v1/auth/login').send(STAFF);
    expect(relogin.status).toBe(401);
  });

  it('prevents an admin from disabling or demoting themselves and keeps one admin', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const me = await ctx.db.user.findUniqueOrThrow({ where: { username: ADMIN.username } });
    expect(
      (await admin.patch(`/api/v1/admin/users/${me.id}`).send({ status: 'DISABLED' })).status,
    ).toBe(409);
    expect((await admin.patch(`/api/v1/admin/users/${me.id}`).send({ role: 'STAFF' })).status).toBe(
      409,
    );
  });

  it('resets a password, forces change and ends sessions', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const staff = await loginAs(ctx.app, STAFF);
    const staffUser = await ctx.db.user.findUniqueOrThrow({ where: { username: STAFF.username } });
    const res = await admin
      .post(`/api/v1/admin/users/${staffUser.id}/reset-password`)
      .send({ temporaryPassword: 'Another-temp-pass-1' });
    expect(res.status).toBe(204);
    expect((await staff.get('/api/v1/auth/me')).status).toBe(401);
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: STAFF.username, password: 'Another-temp-pass-1' });
    expect(login.body.data.mustChangePassword).toBe(true);
  });

  it('lists users with pagination metadata', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin.get('/api/v1/admin/users?page=1&limit=1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination).toEqual({ page: 1, limit: 1, total: 2 });
  });
});
