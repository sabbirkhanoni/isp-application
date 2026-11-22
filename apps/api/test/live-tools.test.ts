import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;
let staff: Awaited<ReturnType<typeof loginAs>>;
let customerId: string;
let agentCustomerId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  Object.assign(ctx.router, {
    failWith: null,
    sessions: {},
    pinged: [],
    kicked: [],
    macLocks: {},
    rate: { rxBps: 2_000_000, txBps: 18_500_000 },
    pingAnswer: { sent: 4, received: 3, lossPercent: 25, avgMs: 9 },
  });
  const pkg = await ctx.db.package.create({
    data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
  });
  admin = await loginAs(ctx.app, ADMIN);
  staff = await loginAs(ctx.app, STAFF);
  const make = async (routerId: string, pppoe: string) =>
    (
      await admin.post('/api/v1/customers').send({
        fullName: 'Karim Mia',
        phone: '01711223344',
        address: 'House 5',
        packageId: pkg.id,
        connectionType: 'PPPOE',
        pppoeUsername: pppoe,
        activationPolicy: 'ACTIVATE_NOW',
        routerId,
      })
    ).body.data.id as string;
  const direct = await admin.post('/api/v1/routers').send({
    name: 'Core-1',
    driver: 'REST',
    host: '10.0.0.1',
    port: 443,
    useTls: true,
    allowSelfSigned: true,
    username: 'u',
    password: 'p',
  });
  customerId = await make(direct.body.data.router.id, 'karim');
  const agent = await admin.post('/api/v1/routers').send({ name: 'Far-1', driver: 'AGENT' });
  agentCustomerId = await make(agent.body.data.router.id, 'rahim');
  ctx.router.sessions['10.0.0.1'] = [
    { name: 'karim', address: '10.9.0.5', callerId: 'AA:BB:CC:00:11:22', uptime: '5m' },
  ];
  await ctx.network.pollSessions();
});

const url = (id: string, tail: string) => `/api/v1/network/lines/customer/${id}/${tail}`;

describe('live tools', () => {
  it('pings the customer session address and reports packet loss', async () => {
    const res = await staff.post(url(customerId, 'ping'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ lossPercent: 25, avgMs: 9, address: '10.9.0.5' });
    expect(ctx.router.pinged).toEqual(['10.9.0.5']);
  });

  it('refuses to ping an offline customer', async () => {
    ctx.router.sessions['10.0.0.1'] = [];
    await ctx.network.pollSessions();
    const res = await staff.post(url(customerId, 'ping'));
    expect(res.status).toBe(400);
  });

  it('restarts the session and records who did it', async () => {
    const res = await staff.post(url(customerId, 'kick'));
    expect(res.status).toBe(200);
    expect(ctx.router.kicked).toEqual(['karim']);
    const log = await ctx.db.auditLog.findFirst({ where: { action: 'SESSION_KICKED' } });
    expect(log).not.toBeNull();
  });

  it('shows live speed in Mbps', async () => {
    const res = await staff.get(url(customerId, 'traffic'));
    expect(res.body.data).toEqual({ online: true, downloadMbps: 18.5, uploadMbps: 2 });
    ctx.router.rate = null;
    const off = await staff.get(url(customerId, 'traffic'));
    expect(off.body.data.online).toBe(false);
  });

  it('lets only an admin lock and reset the MAC', async () => {
    expect((await staff.post(url(customerId, 'mac/lock')).send({})).status).toBe(403);
    expect((await staff.post(url(customerId, 'mac/reset'))).status).toBe(403);

    const locked = await admin.post(url(customerId, 'mac/lock')).send({});
    expect(locked.body.data).toEqual({
      lockedMac: 'AA:BB:CC:00:11:22',
      currentMac: 'AA:BB:CC:00:11:22',
    });
    expect(ctx.router.macLocks['karim']).toBe('AA:BB:CC:00:11:22');
    expect((await staff.get(url(customerId, 'mac'))).body.data.lockedMac).toBe('AA:BB:CC:00:11:22');

    const reset = await admin.post(url(customerId, 'mac/reset'));
    expect(reset.body.data.lockedMac).toBeNull();
    expect(ctx.router.macLocks['karim']).toBeNull();
  });

  it('accepts a typed MAC and rejects a malformed one', async () => {
    const ok = await admin.post(url(customerId, 'mac/lock')).send({ mac: 'aa:bb:cc:dd:ee:ff' });
    expect(ok.body.data.lockedMac).toBe('AA:BB:CC:DD:EE:FF');
    const bad = await admin.post(url(customerId, 'mac/lock')).send({ mac: 'nonsense' });
    expect(bad.status).toBe(400);
  });

  it('explains that agent routers have no live tools', async () => {
    const res = await staff.get(url(agentCustomerId, 'traffic'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/agent/);
  });
});
