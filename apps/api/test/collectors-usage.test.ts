import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-13T05:00:00Z'); // 11:00 Dhaka
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
});

async function addCustomer(name: string, phone: string, area?: string) {
  const admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    ...(area ? { area } : {}),
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; customerCode: string };
}

describe('collectors and targets', () => {
  it('assigns by area, reports billed/collected/outstanding and progress against the target', async () => {
    const a = await addCustomer('Anwar Hossain', '01711111111', 'Mirpur');
    const b = await addCustomer('Babul Mia', '01722222222', 'Mirpur');
    await addCustomer('Chan Mia', '01733333333', 'Uttara');
    const staff = await ctx.db.user.findFirstOrThrow({ where: { role: 'STAFF' } });
    const admin = await loginAs(ctx.app, ADMIN);

    const assigned = await admin
      .post('/api/v1/collectors/assign')
      .send({ collectorId: staff.id, area: 'mirpur' });
    expect(assigned.body.data).toEqual({ updated: 2 });
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: a.id, amountPoisha: 50000, method: 'CASH' });
    const target = await admin
      .put('/api/v1/collectors/targets')
      .send({ userId: staff.id, period: '2026-11', targetPoisha: 200000 });
    expect(target.status).toBe(200);

    const res = await admin.get('/api/v1/collectors/overview?period=2026-11');
    const mine = res.body.data.rows.find((r: { userId: string | null }) => r.userId === staff.id);
    expect(mine).toMatchObject({
      customers: 2,
      billedPoisha: 100000,
      collectedPoisha: 50000,
      outstandingPoisha: 50000,
      targetPoisha: 200000,
    });
    const unassigned = res.body.data.rows.find((r: { userId: string | null }) => r.userId === null);
    expect(unassigned).toMatchObject({ customers: 1 });
    expect(res.body.data.areas).toEqual(['Mirpur', 'Uttara']);

    // The collector sees their own row; others' rows are not available to staff.
    const staffSession = await loginAs(ctx.app, STAFF);
    expect((await staffSession.get('/api/v1/collectors/mine')).body.data.userId).toBe(staff.id);
    expect((await staffSession.get('/api/v1/collectors/overview')).status).toBe(403);
    expect(
      (
        await staffSession.put('/api/v1/collectors/targets').send({
          userId: staff.id,
          period: '2026-11',
          targetPoisha: 1,
        })
      ).status,
    ).toBe(403);
    void b;
  });

  it('assigns by customer IDs, can clear the assignment and removes a target with 0', async () => {
    const a = await addCustomer('Anwar Hossain', '01711111111');
    const staff = await ctx.db.user.findFirstOrThrow({ where: { role: 'STAFF' } });
    const admin = await loginAs(ctx.app, ADMIN);
    const set = await admin
      .post('/api/v1/collectors/assign')
      .send({ collectorId: staff.id, customerCodes: [a.customerCode] });
    expect(set.body.data.updated).toBe(1);
    await admin
      .put('/api/v1/collectors/targets')
      .send({ userId: staff.id, period: '2026-11', targetPoisha: 5000 });
    await admin
      .put('/api/v1/collectors/targets')
      .send({ userId: staff.id, period: '2026-11', targetPoisha: 0 });
    const cleared = await admin
      .post('/api/v1/collectors/assign')
      .send({ collectorId: null, customerCodes: [a.customerCode] });
    expect(cleared.body.data.updated).toBe(1);
    expect(await ctx.db.collectionTarget.count()).toBe(0);
    expect(await ctx.db.customer.count({ where: { collectorId: null } })).toBe(1);
    const bad = await admin
      .post('/api/v1/collectors/assign')
      .send({ collectorId: staff.id, area: 'X', customerCodes: ['C1'] });
    expect(bad.status).toBe(400);
  });
});

describe('traffic usage', () => {
  async function pppoeCustomer() {
    const c = await addCustomer('Anwar Hossain', '01711111111');
    const router = await ctx.db.router.create({
      data: { name: 'Main', driver: 'AGENT', isActive: true },
    });
    await ctx.db.subscription.update({
      where: { customerId: c.id },
      data: { connectionType: 'PPPOE', pppoeUsername: 'anwar', routerId: router.id },
    });
    return { c, router };
  }
  const report = (routerId: string, rx: number, tx: number, uptime = '1h') =>
    ctx.network.agentSessions(routerId, {
      sessions: [{ name: 'anwar', uptime, rxBytes: rx, txBytes: tx }],
    });

  it('adds only the growth between polls and handles reconnects', async () => {
    const { c, router } = await pppoeCustomer();
    await report(router.id, 100, 1000); // first sight: counts nothing
    await report(router.id, 300, 5000); // +200 up, +4000 down
    await report(router.id, 400, 6000); // +100 up, +1000 down
    await report(router.id, 50, 200, '1m'); // counters reset: new session, whole value
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin.get(`/api/v1/usage/customers/${c.id}`);
    expect(res.body.data.months[0]).toEqual({
      period: '2026-11',
      downloadBytes: 5200,
      uploadBytes: 350,
    });
    expect(res.body.data.noData).toBe(false);

    const top = await admin.get('/api/v1/usage/top?period=2026-11');
    expect(top.body.data[0]).toMatchObject({ pppoeUsername: 'anwar', downloadBytes: 5200 });
  });

  it('counts a login that was offline before as a fresh session', async () => {
    const { c, router } = await pppoeCustomer();
    await report(router.id, 100, 100);
    await ctx.network.agentSessions(router.id, { sessions: [] }); // went offline
    await report(router.id, 30, 40, '2m');
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin.get(`/api/v1/usage/customers/${c.id}`);
    expect(res.body.data.months[0]).toMatchObject({ downloadBytes: 40, uploadBytes: 30 });
  });

  it('reports no data for a customer without PPPoE, and prunes old rows', async () => {
    const c = await addCustomer('Chan Mia', '01733333333');
    const admin = await loginAs(ctx.app, ADMIN);
    expect((await admin.get(`/api/v1/usage/customers/${c.id}`)).body.data.noData).toBe(true);
    const { router } = await pppoeCustomer().catch(() => ({ router: null }));
    if (router) {
      await ctx.db.usageDaily.create({
        data: {
          routerId: router.id,
          pppoeUsername: 'old',
          day: new Date('2025-01-01'),
          downloadBytes: 1n,
        },
      });
      expect(await ctx.usage.pruneOld()).toBe(1);
    }
  });
});

describe('monthly trend', () => {
  it('lists billed, collected and unpaid per month, zero-filled', async () => {
    const a = await addCustomer('Anwar Hossain', '01711111111');
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    await admin
      .post('/api/v1/payments')
      .send({ customerId: a.id, amountPoisha: 20000, method: 'CASH' });
    const res = await admin.get('/api/v1/reports/trend?months=3');
    expect(res.body.data.map((m: { period: string }) => m.period)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(res.body.data[0]).toMatchObject({ billedPoisha: 0, collectedPoisha: 0 });
    expect(res.body.data[2]).toMatchObject({
      billedPoisha: 50000,
      collectedPoisha: 20000,
      unpaidPoisha: 30000,
    });
  });
});
