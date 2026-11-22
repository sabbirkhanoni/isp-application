import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RouterError, parseRouterOsUptime } from '../src/modules/network/router-gateway.js';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;
let admin: Awaited<ReturnType<typeof loginAs>>;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  ctx.router.failWith = null;
  ctx.router.sessions = {};
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
});

async function addRouter(name = 'Core-1', host = '10.0.0.1', driver = 'REST') {
  const res = await admin.post('/api/v1/routers').send({
    name,
    driver,
    ...(driver === 'REST'
      ? { host, port: 443, useTls: true, allowSelfSigned: true, username: 'u', password: 'p' }
      : {}),
  });
  expect(res.status).toBe(201);
  return res.body.data as { router: { id: string }; agentToken: string | null };
}

async function addCustomer(routerId: string, pppoe: string, name = 'Karim Mia') {
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone: '01711223344',
    address: 'House 5',
    packageId,
    connectionType: 'PPPOE',
    pppoeUsername: pppoe,
    activationPolicy: 'ACTIVATE_NOW',
    routerId,
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

describe('uptime parser', () => {
  it('reads RouterOS durations', () => {
    expect(parseRouterOsUptime('1w2d3h4m5s')).toBe(604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect(parseRouterOsUptime('45m10s')).toBe(2710);
    expect(parseRouterOsUptime('12s')).toBe(12);
    expect(parseRouterOsUptime('soon')).toBeNull();
    expect(parseRouterOsUptime(null)).toBeNull();
  });
});

describe('line monitoring', () => {
  it('shows online, offline and never-seen lines from a router poll', async () => {
    const { router } = await addRouter();
    const a = await addCustomer(router.id, 'karim01', 'Karim Mia');
    await addCustomer(router.id, 'rahim02', 'Rahim Uddin');
    await addCustomer(router.id, 'salma03', 'Salma Begum');

    ctx.router.sessions['10.0.0.1'] = [
      { name: 'karim01', address: '10.10.0.5', callerId: 'AA:BB', uptime: '2h30m' },
      { name: 'rahim02', address: '10.10.0.6', callerId: null, uptime: '5m' },
    ];
    expect(await ctx.network.pollSessions()).toEqual({ polled: 1, failed: 0 });

    const line = await admin.get(`/api/v1/network/lines/customer/${a.id}`);
    expect(line.body.data).toMatchObject({
      state: 'ONLINE',
      address: '10.10.0.5',
      pppoeUsername: 'karim01',
      routerName: 'Core-1',
    });
    expect(line.body.data.onlineSince).toBe('2026-11-02T01:30:00.000Z');

    // rahim02 drops off the router's list: offline, remembered as last online.
    ctx.clock.set('2026-11-02T05:00:00Z');
    ctx.router.sessions['10.0.0.1'] = [
      { name: 'karim01', address: '10.10.0.5', callerId: 'AA:BB', uptime: '3h30m' },
    ];
    await ctx.network.pollSessions();

    const all = await admin.get('/api/v1/network/lines');
    expect(all.body.meta.summary).toEqual({
      managed: 3,
      online: 1,
      offline: 1,
      neverSeen: 1,
      activeButOffline: 1,
    });
    const offline = await admin.get('/api/v1/network/lines?filter=OFFLINE');
    expect(offline.body.data).toHaveLength(1);
    expect(offline.body.data[0]).toMatchObject({
      customerName: 'Rahim Uddin',
      state: 'OFFLINE',
      address: null,
      lastOnlineAt: '2026-11-02T04:00:00.000Z',
    });
    const never = await admin.get('/api/v1/network/lines?filter=NEVER_SEEN');
    expect(never.body.data.map((r: { customerName: string }) => r.customerName)).toEqual([
      'Salma Begum',
    ]);
    const found = await admin.get('/api/v1/network/lines?search=salma03');
    expect(found.body.data).toHaveLength(1);
  });

  it('keeps the last state and records the error when a router is unreachable', async () => {
    const { router } = await addRouter();
    const c = await addCustomer(router.id, 'karim01');
    ctx.router.sessions['10.0.0.1'] = [
      { name: 'karim01', address: '1.1.1.1', callerId: null, uptime: '1m' },
    ];
    await ctx.network.pollSessions();

    ctx.router.failWith = new RouterError('UNREACHABLE', 'Cannot reach the router', true);
    expect(await ctx.network.pollSessions()).toEqual({ polled: 0, failed: 1 });

    const line = (await admin.get(`/api/v1/network/lines/customer/${c.id}`)).body.data;
    expect(line.state).toBe('ONLINE'); // stale, but flagged:
    expect(line.routerError).toBe('Cannot reach the router');
    const routers = await admin.get('/api/v1/routers');
    expect(routers.body.data[0]).toMatchObject({
      onlineCount: 1,
      lastError: 'Cannot reach the router',
    });
  });

  it('accepts sessions from an agent and ignores another router’s logins', async () => {
    const agent = await addRouter('Branch', '', 'AGENT');
    const other = await addRouter('Core-1');
    const c = await addCustomer(agent.router.id, 'karim01');
    await addCustomer(other.router.id, 'rahim02', 'Rahim');

    const res = await request(ctx.app)
      .post('/api/v1/agent/sessions')
      .set('Authorization', `Bearer ${agent.agentToken}`)
      .send({
        sessions: [{ name: 'karim01', address: '10.1.1.1', uptime: '10m' }, { name: 'rahim02' }],
      });
    expect(res.status).toBe(200);

    expect((await admin.get(`/api/v1/network/lines/customer/${c.id}`)).body.data.state).toBe(
      'ONLINE',
    );
    // "rahim02" belongs to the other router, so the Branch report does not make it online.
    const never = await admin.get('/api/v1/network/lines?filter=NEVER_SEEN');
    expect(never.body.data).toHaveLength(1);
  });

  it('is readable by staff, rejects bad agent tokens and non-router customers have no line', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get('/api/v1/network/lines')).status).toBe(200);

    expect(
      (
        await request(ctx.app)
          .post('/api/v1/agent/sessions')
          .set('Authorization', 'Bearer nope')
          .send({ sessions: [] })
      ).status,
    ).toBe(401);

    const res = await admin.post('/api/v1/customers').send({
      fullName: 'No Router',
      phone: '01811223344',
      address: 'x y z',
      packageId,
      connectionType: 'PPPOE',
      pppoeUsername: 'noroute',
      activationPolicy: 'ACTIVATE_NOW',
    });
    const line = await admin.get(`/api/v1/network/lines/customer/${res.body.data.id}`);
    expect(line.status).toBe(200);
    expect(line.body.data).toBeNull();
  });
});
