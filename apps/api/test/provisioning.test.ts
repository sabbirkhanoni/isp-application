import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;
let home10: string;
let home20: string;
let routerId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  ctx.router.calls.length = 0;
  ctx.router.applied.length = 0;
  ctx.router.missing.clear();
  ctx.router.secrets = {};
  ctx.router.sessions = {};
  ctx.router.failWith = null;
  home10 = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n, pppProfile: 'p10' },
    })
  ).id;
  home20 = (
    await ctx.db.package.create({
      data: { name: 'Home 20', speedMbps: 20, monthlyPricePoisha: 80000n, pppProfile: 'p20' },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/routers').send({
    name: 'Core-1',
    driver: 'REST',
    host: '10.0.0.1',
    port: 443,
    useTls: true,
    allowSelfSigned: true,
    username: 'u',
    password: 'p',
  });
  routerId = res.body.data.router.id;
});

async function addCustomer(extra: Record<string, unknown> = {}) {
  const res = await admin.post('/api/v1/customers').send({
    fullName: 'Karim Mia',
    phone: '01711223344',
    address: 'House 5, Road 2',
    packageId: home10,
    connectionType: 'PPPOE',
    pppoeUsername: 'karim01',
    activationPolicy: 'ACTIVATE_NOW',
    routerId,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; subscription: { hasPppoePassword: boolean } };
}

describe('creating the PPPoE account on the router', () => {
  it('creates the missing account with the stored password and keeps the password', async () => {
    ctx.router.missing.add('karim01');
    const c = await addCustomer({ pppoePassword: 'secret123' });
    expect(c.subscription.hasPppoePassword).toBe(true);

    await ctx.network.runDue();
    expect(ctx.router.applied).toEqual([{ user: 'karim01', profile: 'p10', created: true }]);

    const shown = await admin.get(`/api/v1/network/lines/customer/${c.id}/password`);
    expect(shown.body.data.password).toBe('secret123');
    const audit = await ctx.db.auditLog.findMany({ where: { action: 'PPPOE_PASSWORD_VIEWED' } });
    expect(audit).toHaveLength(1);

    // a later suspension must not discard the password
    await admin.post(`/api/v1/customers/${c.id}/suspend`).send({ reason: 'MANUAL' });
    await ctx.network.runDue();
    const again = await admin.get(`/api/v1/network/lines/customer/${c.id}/password`);
    expect(again.body.data.password).toBe('secret123');
  });

  it('generates a password when none is typed, and never stores one for an existing account', async () => {
    const c = await addCustomer(); // account exists on the router already
    expect(c.subscription.hasPppoePassword).toBe(true);
    await ctx.network.runDue();
    expect(ctx.router.applied[0]).toMatchObject({ created: false, profile: 'p10' });
    // the stored password never reached the router, so it is dropped instead of shown as real
    const shown = await admin.get(`/api/v1/network/lines/customer/${c.id}/password`);
    expect(shown.body.data.password).toBeNull();
  });

  it('keeps the old behaviour when no password exists: missing account fails without retry', async () => {
    const c = await addCustomer();
    await ctx.db.subscription.updateMany({ data: { pppoePasswordEnc: null } });
    ctx.router.missing.add('karim01');
    await ctx.network.runDue();
    const job = await ctx.db.networkJob.findFirstOrThrow({ where: { customerId: c.id } });
    expect(job.status).toBe('FAILED');
    expect(job.lastError).toContain('does not exist');
  });

  it('only the admin can read the password', async () => {
    const c = await addCustomer();
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get(`/api/v1/network/lines/customer/${c.id}/password`)).status).toBe(403);
  });
});

describe('plan change', () => {
  it('moves the customer to the new package and sends the new profile', async () => {
    const c = await addCustomer();
    await ctx.network.runDue();
    ctx.router.applied.length = 0;

    const res = await admin.patch(`/api/v1/customers/${c.id}`).send({ packageId: home20 });
    expect(res.status).toBe(200);
    expect(res.body.data.subscription.packageName).toBe('Home 20');

    await ctx.network.runDue();
    expect(ctx.router.applied).toEqual([{ user: 'karim01', profile: 'p20', created: false }]);
  });

  it('refuses an inactive package', async () => {
    const c = await addCustomer();
    await ctx.db.package.update({ where: { id: home20 }, data: { isActive: false } });
    expect(
      (await admin.patch(`/api/v1/customers/${c.id}`).send({ packageId: home20 })).status,
    ).toBe(400);
  });
});

describe('OLT / ONU details', () => {
  it('saves them, clears them, and finds the customer by ONU serial', async () => {
    const c = await addCustomer({ oltName: 'OLT-A', ponPort: '0/1/3', onuSerial: 'ZTEG12345678' });
    expect(c).toBeTruthy();
    const one = await admin.get(`/api/v1/customers/${c.id}`);
    expect(one.body.data.subscription).toMatchObject({
      oltName: 'OLT-A',
      ponPort: '0/1/3',
      onuSerial: 'ZTEG12345678',
    });
    const found = await admin.get('/api/v1/customers?search=zteg1234');
    expect(found.body.data).toHaveLength(1);

    const cleared = await admin.patch(`/api/v1/customers/${c.id}`).send({ onuSerial: null });
    expect(cleared.body.data.subscription.onuSerial).toBeNull();
    expect(ctx.router.calls).toHaveLength(0); // ONU notes never touch the router
  });
});

describe('router compare report', () => {
  it('lists router-only accounts, missing accounts and differences, and fixes them', async () => {
    const same = await addCustomer({ pppoeUsername: 'ok01', fullName: 'Same' });
    const wrongProfile = await addCustomer({ pppoeUsername: 'slow02', fullName: 'Slow' });
    const missing = await addCustomer({ pppoeUsername: 'gone03', fullName: 'Gone' });
    await ctx.db.networkJob.deleteMany();
    await ctx.db.subscription.updateMany({
      where: { customerId: { not: missing.id } },
      data: { pppoePasswordEnc: null },
    });

    ctx.router.secrets['10.0.0.1'] = [
      { name: 'ok01', profile: 'p10', disabled: false },
      { name: 'slow02', profile: 'p5', disabled: false },
      { name: 'stranger', profile: 'p20', disabled: true },
    ];
    expect((await admin.post(`/api/v1/routers/${routerId}/refresh`).send({})).status).toBe(200);

    const report = (await admin.get(`/api/v1/routers/${routerId}/compare`)).body.data;
    expect(report.routerCount).toBe(3);
    expect(report.routerOnly.map((r: { name: string }) => r.name)).toEqual(['stranger']);
    expect(report.missingOnRouter).toMatchObject([{ pppoeUsername: 'gone03', canCreate: true }]);
    expect(report.mismatches).toMatchObject([
      { pppoeUsername: 'slow02', wantedProfile: 'p10', routerProfile: 'p5' },
    ]);
    expect(same.id).toBeTruthy();
    expect(wrongProfile.id).toBeTruthy();

    const csv = await admin.get(`/api/v1/routers/${routerId}/router-only.csv`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('stranger');
    expect(csv.text).toContain('Home 20'); // package found through the profile
    expect(csv.text).toContain('SUSPENDED');

    ctx.router.missing.add('gone03');
    expect((await admin.post(`/api/v1/routers/${routerId}/fix`).send({})).body.data.queued).toBe(2);
    await ctx.network.runDue();
    expect(ctx.router.applied.map((a) => `${a.user}:${a.profile}:${a.created}`).sort()).toEqual([
      'gone03:p10:true',
      'slow02:p10:false',
    ]);
  });

  it('is admin-only and shows an empty report before the first read', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get(`/api/v1/routers/${routerId}/compare`)).status).toBe(403);
    const report = (await admin.get(`/api/v1/routers/${routerId}/compare`)).body.data;
    expect(report.checkedAt).toBeNull();
    expect((await request(ctx.app).get(`/api/v1/routers/${routerId}/compare`)).status).toBe(401);
  });

  it('the poller refreshes the account list and agents can report it', async () => {
    ctx.router.secrets['10.0.0.1'] = [{ name: 'a', profile: 'p10', disabled: false }];
    await ctx.network.pollSessions();
    expect((await admin.get(`/api/v1/routers/${routerId}/compare`)).body.data.routerCount).toBe(1);

    const agent = await admin.post('/api/v1/routers').send({ name: 'Branch', driver: 'AGENT' });
    const token = agent.body.data.agentToken as string;
    const sent = await request(ctx.app)
      .post('/api/v1/agent/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessions: [],
        secrets: [
          { name: 'x', profile: 'p10', disabled: false },
          { name: 'y', disabled: true },
        ],
      });
    expect(sent.status).toBe(200);
    const id = agent.body.data.router.id as string;
    expect((await admin.get(`/api/v1/routers/${id}/compare`)).body.data.routerCount).toBe(2);
  });
});
