import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;
let staff: Awaited<ReturnType<typeof loginAs>>;
let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
  staff = await loginAs(ctx.app, STAFF);
});

async function addCustomer(name: string, phone: string, extra: Record<string, unknown> = {}) {
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; customerCode: string };
}

describe('system check', () => {
  it('reports status per item and is admin-only', async () => {
    const res = await admin.get('/api/v1/system/check');
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      res.body.data.map((i: { key: string; status: string }) => [i.key, i.status]),
    );
    expect(byKey['database']).toBe('ok');
    expect(byKey['migrations']).toBe('ok');
    expect(byKey['sms']).toBe('warn'); // test config uses the log driver
    expect(byKey['backups']).toBe('info');
    expect((await staff.get('/api/v1/system/check')).status).toBe(403);
  });

  it('warns when customers are active but nothing was billed this month', async () => {
    await addCustomer('Karim', '01711223344');
    const before = await admin.get('/api/v1/system/check');
    expect(before.body.data.find((i: { key: string }) => i.key === 'invoices').status).toBe('warn');
    await ctx.billing.generateForPeriod();
    const after = await admin.get('/api/v1/system/check');
    expect(after.body.data.find((i: { key: string }) => i.key === 'invoices')).toMatchObject({
      status: 'ok',
      detail: '1',
    });
  });
});

describe('data quality report', () => {
  it('finds duplicate and malformed phone numbers', async () => {
    await addCustomer('Karim', '01711223344');
    await addCustomer('Rahim', '01711223344');
    const odd = await addCustomer('Salam', '01811223344');
    await ctx.db.customer.update({ where: { id: odd.id }, data: { phone: '12345' } });

    const res = await admin.get('/api/v1/system/data-quality');
    expect(res.status).toBe(200);
    const group = (key: string) => res.body.data.find((g: { key: string }) => g.key === key);
    expect(group('duplicatePhone').count).toBe(2);
    expect(group('duplicatePhone').samples[0].detail).toBe('01711223344');
    expect(group('invalidPhone')).toMatchObject({ count: 1 });
    expect(group('invalidPhone').samples[0]).toMatchObject({ fullName: 'Salam', detail: '12345' });
    expect(group('invoiceMismatch').count).toBe(0);
    expect((await staff.get('/api/v1/system/data-quality')).status).toBe(403);
  });

  it('flags PPPoE customers that have no router', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.db.subscription.update({
      where: { customerId: c.id },
      data: { connectionType: 'PPPOE', pppoeUsername: 'karim1', routerId: null },
    });
    const res = await admin.get('/api/v1/system/data-quality');
    const group = (key: string) => res.body.data.find((g: { key: string }) => g.key === key);
    expect(group('pppoeNoRouter').count).toBe(1);
  });
});

describe('data export', () => {
  it('exports customers, invoices and payments as CSV and logs it', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 20050, method: 'CASH' });

    const customers = await admin.get('/api/v1/system/export/customers');
    expect(customers.status).toBe(200);
    expect(customers.headers['content-type']).toContain('text/csv');
    expect(customers.headers['content-disposition']).toContain('customers-2026-11-02.csv');
    expect(customers.text).toContain('Karim');
    expect(customers.text).toContain('Home 10');

    const invoices = await admin.get('/api/v1/system/export/invoices');
    expect(invoices.text).toContain('2026-11');
    expect(invoices.text).toContain('500');

    const payments = await admin.get('/api/v1/system/export/payments');
    expect(payments.text).toContain('200.50');

    expect((await admin.get('/api/v1/system/export/secrets')).status).toBe(400);
    expect((await staff.get('/api/v1/system/export/customers')).status).toBe(403);

    const log = await admin.get('/api/v1/audit-logs');
    expect(
      log.body.data.filter((r: { action: string }) => r.action === 'DATA_EXPORTED'),
    ).toHaveLength(3);
  });
});
