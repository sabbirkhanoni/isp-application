import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;
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
});

async function addCustomer(fullName: string, phone: string, area: string) {
  const res = await admin.post('/api/v1/customers').send({
    fullName,
    phone,
    address: 'House 5',
    area,
    packageId,
    connectionType: 'PPPOE',
    pppoeUsername: phone,
    activationPolicy: 'ACTIVATE_NOW',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; customerCode: string };
}

const pay = (customerId: string, amountPoisha: number, method: 'CASH' | 'BKASH', trx?: string) =>
  admin.post('/api/v1/payments').send({
    customerId,
    amountPoisha,
    method,
    ...(trx ? { bkashTrxId: trx } : {}),
  });

async function scenario() {
  const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
  const rahim = await addCustomer('Rahim Uddin', '01811223355', 'Uttara');
  await ctx.billing.generateForPeriod(); // Nov bills: 500 each, due 10 Nov
  expect((await pay(karim.id, 50000, 'CASH')).status).toBe(201);
  expect((await pay(rahim.id, 20000, 'BKASH', 'ABC1234567')).status).toBe(201);
  return { karim, rahim };
}

describe('GET /reports/summary', () => {
  it('adds up billing, collections and what is still owed', async () => {
    await scenario();
    ctx.clock.set('2026-11-20T04:00:00Z');
    const res = await admin.get('/api/v1/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      period: '2026-11',
      customers: { active: 2, pendingActivation: 0, suspended: 0 },
      billing: {
        invoicedPoisha: 100000,
        invoiceCount: 2,
        collectedPoisha: 70000,
        collectedCashPoisha: 50000,
        collectedBkashPoisha: 20000,
        outstandingPoisha: 30000,
        overduePoisha: 30000,
        overdueCustomers: 1,
      },
      attention: { bkashNeedsReview: 0, failedRouterJobs: 0 },
    });
    expect(res.body.data.daily).toEqual([
      { date: '2026-11-02', cashPoisha: 50000, bkashPoisha: 20000 },
    ]);
  });

  it('does not count a reversed payment as collected', async () => {
    const { karim } = await scenario();
    const payments = await admin.get(`/api/v1/customers/${karim.id}/billing`);
    const paymentId = payments.body.data.payments[0].id as string;
    expect(
      (await admin.post(`/api/v1/payments/${paymentId}/reverse`).send({ reason: 'wrong customer' }))
        .status,
    ).toBe(200);
    const res = await admin.get('/api/v1/reports/summary');
    expect(res.body.data.billing).toMatchObject({
      collectedCashPoisha: 0,
      collectedPoisha: 20000,
      outstandingPoisha: 80000,
    });
  });

  it('puts a payment on the Dhaka calendar day, not the UTC day', async () => {
    const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
    await ctx.billing.generateForPeriod();
    ctx.clock.set('2026-11-30T19:00:00Z'); // 1 December, 01:00 in Dhaka
    await pay(karim.id, 10000, 'CASH');
    const nov = await admin.get('/api/v1/reports/summary?period=2026-11');
    const dec = await admin.get('/api/v1/reports/summary?period=2026-12');
    expect(nov.body.data.billing.collectedPoisha).toBe(0);
    expect(dec.body.data.billing.collectedPoisha).toBe(10000);
    expect(dec.body.data.daily[0].date).toBe('2026-12-01');
  });

  it('is admin-only and validates the period', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get('/api/v1/reports/summary')).status).toBe(403);
    expect((await admin.get('/api/v1/reports/summary?period=2026-13')).status).toBe(400);
  });
});

describe('GET /reports/dues', () => {
  it('lists customers who owe money, oldest debt first, with days overdue', async () => {
    const { rahim } = await scenario();
    ctx.clock.set('2026-11-20T04:00:00Z');
    const res = await admin.get('/api/v1/reports/dues');
    expect(res.body.data).toEqual([
      expect.objectContaining({
        customerId: rahim.id,
        customerName: 'Rahim Uddin',
        area: 'Uttara',
        outstandingPoisha: 30000,
        openInvoices: 1,
        oldestDueDate: '2026-11-10',
        daysOverdue: 10,
      }),
    ]);
    expect(res.body.meta.pagination.total).toBe(1);
  });

  it('filters by search text and by overdue', async () => {
    await scenario();
    expect((await admin.get('/api/v1/reports/dues?search=karim')).body.data).toHaveLength(0);
    expect((await admin.get('/api/v1/reports/dues?search=01811')).body.data).toHaveLength(1);
    // Before the due date nothing is overdue yet, but the bill is still owed.
    expect((await admin.get('/api/v1/reports/dues?overdueOnly=true')).body.data).toHaveLength(0);
    expect((await admin.get('/api/v1/reports/dues')).body.data).toHaveLength(1);
  });

  it('is open to staff (collectors) but not exportable by them', async () => {
    await scenario();
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get('/api/v1/reports/dues')).status).toBe(200);
    expect((await staff.get('/api/v1/reports/dues.csv')).status).toBe(403);
    expect((await staff.get('/api/v1/reports/collections.csv')).status).toBe(403);
  });
});

describe('CSV exports', () => {
  it('exports dues as a spreadsheet-friendly file', async () => {
    await scenario();
    ctx.clock.set('2026-11-20T04:00:00Z');
    const res = await admin.get('/api/v1/reports/dues.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('dues.csv');
    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'Customer ID,Name,Phone,Area,Status,Due (BDT),Open bills,Oldest due date,Days overdue',
    );
    expect(lines[1]).toMatch(/,Rahim Uddin,01811223355,Uttara,ACTIVE,300\.00,1,2026-11-10,10$/);
    expect(res.text.startsWith('﻿')).toBe(true);
  });

  it('exports the month’s collections', async () => {
    await scenario();
    const res = await admin.get('/api/v1/reports/collections.csv?period=2026-11');
    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.includes('BKASH,ABC1234567,200.00,POSTED'))).toBe(true);
    expect(lines.some((l) => l.includes('CASH,,500.00,POSTED'))).toBe(true);
    expect(lines[1]).toContain('2026-11-02 10:00');
  });

  it('neutralises spreadsheet formulas in names', async () => {
    const evil = await addCustomer('=HYPERLINK("http://x")', '01711223344', 'Mirpur');
    await ctx.billing.generateForPeriod();
    void evil;
    const res = await admin.get('/api/v1/reports/dues.csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});
