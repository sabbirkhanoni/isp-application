import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext({ OWNER_PHONE: '01711000000' });
afterAll(() => ctx.close());

let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-13T05:00:00Z'); // 11:00 Dhaka
  ctx.sms.sent.length = 0;
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
  return res.body.data as { id: string };
}

describe('bulk SMS', () => {
  it('is admin-only', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    const res = await staff.post('/api/v1/sms-broadcast').send({
      audience: {},
      message: 'Service is back to normal.',
    });
    expect(res.status).toBe(403);
  });

  it('queues personalised messages for the chosen area, skips opted-out customers, then sends', async () => {
    const a = await addCustomer('Anwar Hossain', '01711111111', 'Mirpur');
    await addCustomer('Babul Mia', '01722222222', 'Mirpur');
    await addCustomer('Chan Mia', '01733333333', 'Uttara');
    await ctx.db.customer.update({ where: { id: a.id }, data: { smsOptOut: true } });
    const admin = await loginAs(ctx.app, ADMIN);
    const body = {
      audience: { area: 'mirpur' },
      message: 'Dear {name}, internet will be off tomorrow 2-4pm.',
    };

    const preview = await admin.post('/api/v1/sms-broadcast/preview').send(body);
    expect(preview.body.data).toMatchObject({ recipients: 1, optedOut: 1, tooMany: false });
    expect(preview.body.data.areas).toEqual(['Mirpur', 'Uttara']);

    const sent = await admin.post('/api/v1/sms-broadcast').send(body);
    expect(sent.body.data).toEqual({ queued: 1 });
    await ctx.notifications.dispatchPending();
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0]).toMatchObject({ phone: '01722222222' });
    expect(ctx.sms.sent[0]?.message).toContain('Dear Babul Mia');
    const audit = await ctx.db.auditLog.count({ where: { action: 'SMS_BROADCAST_QUEUED' } });
    expect(audit).toBe(1);
  });

  it('rejects an empty selection', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin
      .post('/api/v1/sms-broadcast')
      .send({ audience: { area: 'Nowhere' }, message: 'Hello everyone, notice.' });
    expect(res.status).toBe(400);
  });

  it('can target only customers with unpaid bills', async () => {
    await addCustomer('Anwar Hossain', '01711111111');
    await addCustomer('Babul Mia', '01722222222');
    await ctx.billing.generateForPeriod();
    const first = await ctx.db.invoice.findFirstOrThrow();
    await ctx.db.invoice.update({
      where: { id: first.id },
      data: { status: 'PAID', paidPoisha: first.amountPoisha },
    });
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin
      .post('/api/v1/sms-broadcast/preview')
      .send({ audience: { onlyWithDues: true }, message: 'Please pay your bill.' });
    expect(res.body.data.recipients).toBe(1);
  });
});

describe('auto-suspend setting', () => {
  it('is off by default and can be switched on from the settings screen', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const before = await admin.get('/api/v1/billing-settings');
    expect(before.body.data.autoSuspend).toEqual({ enabled: false, graceDays: 3 });
    const saved = await admin.put('/api/v1/billing-settings').send({
      ...before.body.data,
      autoSuspend: { enabled: true, graceDays: 5 },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.autoSuspend).toEqual({ enabled: true, graceDays: 5 });
    expect((await ctx.billingSettings.get()).autoSuspend.graceDays).toBe(5);
  });
});

describe('owner alerts', () => {
  async function router(name: string, lastSeenMinutesAgo: number) {
    return ctx.db.router.create({
      data: {
        name,
        driver: 'AGENT',
        isActive: true,
        lastSeenAt: new Date(ctx.clock.now().getTime() - lastSeenMinutesAgo * 60_000),
      },
    });
  }

  it('reports a silent router once and its recovery once', async () => {
    const r = await router('Main', 30);
    expect(await ctx.alerts.check()).toBe(1);
    expect(ctx.sms.sent[0]?.message).toContain('Main');
    expect(await ctx.alerts.check()).toBe(0); // no repeat

    await ctx.db.router.update({ where: { id: r.id }, data: { lastSeenAt: ctx.clock.now() } });
    expect(await ctx.alerts.check()).toBe(1);
    expect(ctx.sms.sent[1]?.message).toContain('back online');
    expect(await ctx.alerts.check()).toBe(0);
  });

  it('stays quiet for a healthy router', async () => {
    await router('Main', 1);
    expect(await ctx.alerts.check()).toBe(0);
    expect(ctx.sms.sent).toHaveLength(0);
  });

  it('warns when most customers drop at once', async () => {
    const r = await router('Main', 0);
    const rows = Array.from({ length: 20 }, (_, i) => ({
      routerId: r.id,
      pppoeUsername: `user${i}`,
      online: true,
      updatedAt: ctx.clock.now(),
    }));
    await ctx.db.lineStatus.createMany({ data: rows });
    expect(await ctx.alerts.check()).toBe(0); // first reading is the baseline
    await ctx.db.lineStatus.updateMany({
      where: { pppoeUsername: { in: rows.slice(0, 15).map((x) => x.pppoeUsername) } },
      data: { online: false },
    });
    expect(await ctx.alerts.check()).toBe(1);
    expect(ctx.sms.sent[0]?.message).toContain('20 to 5');
    expect(await ctx.alerts.check()).toBe(0); // cooldown / no repeat
  });
});
