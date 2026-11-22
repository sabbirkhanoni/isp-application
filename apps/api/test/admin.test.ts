import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext({ SMS_LOCALE: 'en' });
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;
let staff: Awaited<ReturnType<typeof loginAs>>;
let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await ctx.db.systemSetting.deleteMany();
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  ctx.sms.sent.length = 0;
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
  staff = await loginAs(ctx.app, STAFF);
});

async function addCustomer(phone = '01711223344') {
  const res = await admin.post('/api/v1/customers').send({
    fullName: 'Karim',
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

describe('SMS templates', () => {
  it('shows built-ins, saves a custom text, and uses it for the next message', async () => {
    const before = await admin.get('/api/v1/sms-templates');
    expect(before.status).toBe(200);
    expect(before.body.data.items[0]).toMatchObject({ type: 'reminder', isCustom: false });

    const saved = await admin
      .put('/api/v1/sms-templates/paymentReceived')
      .send({ template: 'Thanks {name}! Got Tk {amount}, receipt {receipt}, left {remaining}.' });
    expect(saved.status).toBe(200);
    const item = saved.body.data.items.find((i: { type: string }) => i.type === 'paymentReceived');
    expect(item).toMatchObject({ isCustom: true });
    expect(item.preview).toContain('Thanks Karim!');

    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 20000, method: 'CASH' });
    await ctx.notifications.dispatchPending();
    expect(ctx.sms.sent[0]?.message).toBe('Thanks Karim! Got Tk 200, receipt R000001, left 300.');

    const reset = await admin.delete('/api/v1/sms-templates/paymentReceived');
    expect(reset.body.data.items[1]).toMatchObject({ isCustom: false });
  });

  it('rejects unknown placeholders and non-admins', async () => {
    const bad = await admin
      .put('/api/v1/sms-templates/reminder')
      .send({ template: 'Hello {nam}, pay {amountDue}' });
    expect(bad.status).toBe(400);
    expect((await staff.get('/api/v1/sms-templates')).status).toBe(403);
    expect(
      (await admin.put('/api/v1/sms-templates/nope').send({ template: 'hello there' })).status,
    ).toBe(400);
  });
});

describe('SMS opt-out switch', () => {
  it('can be turned on and off on the customer, and stops payment SMS', async () => {
    const c = await addCustomer();
    const off = await admin.patch(`/api/v1/customers/${c.id}`).send({ smsOptOut: true });
    expect(off.status).toBe(200);
    expect(off.body.data.smsOptOut).toBe(true);
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 20000, method: 'CASH' });
    expect(await ctx.notifications.dispatchPending()).toMatchObject({ sent: 0 });
    const on = await admin.patch(`/api/v1/customers/${c.id}`).send({ smsOptOut: false });
    expect(on.body.data.smsOptOut).toBe(false);
  });
});

describe('extra staff permissions', () => {
  it('grants only the chosen rights, takes effect immediately, and rejects admin-only ones', async () => {
    const me = await staff.get('/api/v1/auth/me');
    expect((await staff.get('/api/v1/reports/dues')).status).toBeLessThan(500);
    expect((await staff.post('/api/v1/invoices/generate').send({})).status).toBe(403);

    const users = await admin.get('/api/v1/admin/users');
    const staffUser = users.body.data.find(
      (u: { username: string }) => u.username === STAFF.username,
    );
    expect(staffUser.extraPermissions).toEqual([]);

    const bad = await admin
      .patch(`/api/v1/admin/users/${staffUser.id}`)
      .send({ extraPermissions: ['USER_MANAGE'] });
    expect(bad.status).toBe(400);

    const ok = await admin
      .patch(`/api/v1/admin/users/${staffUser.id}`)
      .send({ extraPermissions: ['BILLING_RUN', 'CUSTOMER_UPDATE'] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.extraPermissions).toEqual(['CUSTOMER_UPDATE', 'BILLING_RUN']);

    const after = await staff.get('/api/v1/auth/me');
    expect(after.body.data.permissions).toEqual(
      expect.arrayContaining([...me.body.data.permissions, 'BILLING_RUN', 'CUSTOMER_UPDATE']),
    );
    expect(after.body.data.permissions).not.toContain('USER_MANAGE');
    expect((await staff.get('/api/v1/admin/users')).status).toBe(403);
  });
});

describe('audit log viewer', () => {
  it('lists sign-ins, filters by group and date, and is admin-only', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: STAFF.username, password: 'wrong-password-1' });
    const all = await admin.get('/api/v1/audit-logs');
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThan(0);
    const logins = await admin.get('/api/v1/audit-logs?group=logins');
    expect(logins.body.data.every((r: { action: string }) => r.action.startsWith('AUTH_'))).toBe(
      true,
    );
    expect(logins.body.data[0]).toHaveProperty('actorUsername');

    await staff.get('/api/v1/audit-logs'); // denied, and recorded as such
    const denied = await admin.get('/api/v1/audit-logs?group=denied');
    expect(denied.body.data[0]).toMatchObject({
      action: 'AUTH_PERMISSION_DENIED',
      outcome: 'DENIED',
    });

    const future = await admin.get('/api/v1/audit-logs?from=2099-01-01');
    expect(future.body.data).toHaveLength(0);
    expect((await staff.get('/api/v1/audit-logs')).status).toBe(403);
  });
});
