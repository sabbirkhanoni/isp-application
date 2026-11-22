import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, createTestContext, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
});

const lastLoginIp = async () =>
  (await ctx.db.auditLog.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).ipAddress;

describe('client IP behind the Pages proxy', () => {
  it('uses the forwarded visitor address only when the shared secret matches', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '203.0.113.9')
      .set('x-proxy-secret', 'test-proxy-secret-0123456789')
      .send({ ...ADMIN, password: 'wrong-password-1' });
    expect(await lastLoginIp()).toBe('203.0.113.9');
  });

  it('ignores a forwarded address from a caller without the secret', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '203.0.113.50')
      .set('x-proxy-secret', 'a-wrong-secret-of-same-len!')
      .send({ ...ADMIN, password: 'wrong-password-1' });
    expect(await lastLoginIp()).not.toBe('203.0.113.50');
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '203.0.113.51')
      .send({ ...ADMIN, password: 'wrong-password-1' });
    expect(await lastLoginIp()).not.toBe('203.0.113.51');
  });
});

describe('request size limits', () => {
  it('rejects a large body on a normal route', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: 'x'.repeat(200_000), password: 'y' });
    expect(res.status).toBe(413);
  });

  it('does not read the large statement upload for someone who is not logged in', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/bkash/imports')
      .send({ fileName: 'a.csv', csv: 'x'.repeat(1_000_000) });
    expect(res.status).toBe(401);
  });
});
