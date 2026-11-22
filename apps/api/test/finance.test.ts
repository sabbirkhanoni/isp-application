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
  ctx.sms.sent.length = 0;
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
  staff = await loginAs(ctx.app, STAFF);
});

async function addCustomer(name: string, phone: string, area: string) {
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    area,
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

const pay = (agent: typeof admin, customerId: string, amountPoisha: number, trx?: string) =>
  agent.post('/api/v1/payments').send({
    customerId,
    amountPoisha,
    method: trx ? 'BKASH' : 'CASH',
    ...(trx ? { bkashTrxId: trx } : {}),
  });

const expense = (body: Record<string, unknown>) =>
  admin.post('/api/v1/expenses').send({
    spentOn: '2026-11-01',
    category: 'RENT',
    amountPoisha: 1000000,
    ...body,
  });

describe('expenses', () => {
  it('records, lists by month, totals, edits and deletes (admin only)', async () => {
    expect((await expense({})).status).toBe(201);
    const bandwidth = await expense({
      category: 'BANDWIDTH',
      amountPoisha: 2500000,
      payee: 'Upstream Ltd',
    });
    await expense({ spentOn: '2026-10-28', category: 'SALARY', amountPoisha: 3000000 });

    const nov = await admin.get('/api/v1/expenses?period=2026-11');
    expect(nov.body.data).toHaveLength(2);
    expect(nov.body.meta.totalPoisha).toBe(3500000);
    expect((await admin.get('/api/v1/expenses?category=SALARY')).body.data).toHaveLength(1);

    const edited = await admin
      .patch(`/api/v1/expenses/${bandwidth.body.data.id}`)
      .send({ amountPoisha: 2600000, note: 'extra 10 Mbps' });
    expect(edited.body.data).toMatchObject({ amountPoisha: 2600000, note: 'extra 10 Mbps' });
    expect((await admin.delete(`/api/v1/expenses/${bandwidth.body.data.id}`)).status).toBe(200);
    expect((await admin.get('/api/v1/expenses?period=2026-11')).body.meta.totalPoisha).toBe(
      1000000,
    );

    const csv = await admin.get('/api/v1/expenses/export.csv?period=2026-11');
    expect(csv.text).toContain('RENT');
    const actions = (await ctx.db.auditLog.findMany()).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED']),
    );

    expect((await staff.get('/api/v1/expenses')).status).toBe(403);
    expect((await staff.post('/api/v1/expenses').send({})).status).toBe(403);
  });

  it('rejects zero, negative and unknown categories', async () => {
    expect((await expense({ amountPoisha: 0 })).status).toBe(400);
    expect((await expense({ category: 'LUNCH' })).status).toBe(400);
    expect((await expense({ spentOn: '02/11/2026' })).status).toBe(400);
  });
});

describe('profit and loss', () => {
  it('shows each month and the category split', async () => {
    const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
    await ctx.billing.generateForPeriod();
    await pay(admin, karim.id, 50000);
    await expense({ category: 'BANDWIDTH', amountPoisha: 20000 });
    await expense({ category: 'RENT', amountPoisha: 10000 });
    await expense({ spentOn: '2026-10-15', category: 'SALARY', amountPoisha: 5000 });

    const res = await admin.get('/api/v1/reports/profit?months=2');
    expect(res.status).toBe(200);
    expect(res.body.data.months).toEqual([
      {
        period: '2026-10',
        invoicedPoisha: 0,
        collectedPoisha: 0,
        expensesPoisha: 5000,
        profitPoisha: -5000,
      },
      {
        period: '2026-11',
        invoicedPoisha: 50000,
        collectedPoisha: 50000,
        expensesPoisha: 30000,
        profitPoisha: 20000,
      },
    ]);
    expect(res.body.data.categories).toEqual([
      { category: 'BANDWIDTH', totalPoisha: 20000 },
      { category: 'RENT', totalPoisha: 10000 },
    ]);
    const csv = await admin.get('/api/v1/reports/profit.csv?months=2');
    expect(csv.text).toContain('2026-11,500.00,500.00,300.00,200.00');
    expect((await staff.get('/api/v1/reports/profit')).status).toBe(403);
  });
});

describe('collector, area and churn reports', () => {
  it('splits collection by who received it, and by area', async () => {
    const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
    const rahim = await addCustomer('Rahim Uddin', '01811223355', 'Uttara');
    await addCustomer('Salma Begum', '01911223366', 'Mirpur');
    await ctx.billing.generateForPeriod();
    await pay(staff, karim.id, 50000);
    await pay(admin, rahim.id, 20000, 'ABC1234567');

    const collectors = (await admin.get('/api/v1/reports/collectors')).body.data;
    expect(collectors).toHaveLength(2);
    expect(collectors[0]).toMatchObject({
      payments: 1,
      cashPoisha: 50000,
      bkashPoisha: 0,
      totalPoisha: 50000,
    });
    expect(collectors[1]).toMatchObject({
      name: 'Owner',
      payments: 1,
      cashPoisha: 0,
      bkashPoisha: 20000,
      totalPoisha: 20000,
    });
    expect((await admin.get('/api/v1/reports/collectors.csv')).text).toContain('Cash (BDT)');

    const areas = (await admin.get('/api/v1/reports/areas')).body.data;
    expect(areas).toEqual([
      {
        area: 'Mirpur',
        customers: 2,
        activeCustomers: 2,
        outstandingPoisha: 50000,
        collectedPoisha: 50000,
      },
      {
        area: 'Uttara',
        customers: 1,
        activeCustomers: 1,
        outstandingPoisha: 30000,
        collectedPoisha: 20000,
      },
    ]);
    expect((await admin.get('/api/v1/reports/areas.csv')).text).toContain(
      'Mirpur,2,2,500.00,500.00',
    );
  });

  it('records a customer leaving, counts it in churn, and can bring them back', async () => {
    const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
    await addCustomer('Rahim Uddin', '01811223355', 'Uttara');
    await ctx.billing.generateForPeriod();

    expect((await staff.post(`/api/v1/customers/${karim.id}/terminate`).send({})).status).toBe(403);
    const left = await admin
      .post(`/api/v1/customers/${karim.id}/terminate`)
      .send({ note: 'moved away' });
    expect(left.status).toBe(200);
    expect(left.body.data.status).toBe('TERMINATED');
    expect((await admin.post(`/api/v1/customers/${karim.id}/terminate`).send({})).status).toBe(409);

    // no new bills for someone who left, unpaid bills stay collectable
    ctx.clock.set('2026-12-02T04:00:00Z');
    await ctx.billing.generateForPeriod();
    expect(await ctx.db.invoice.count({ where: { customerId: karim.id } })).toBe(1);
    expect(
      (await admin.get('/api/v1/reports/dues')).body.data.map(
        (d: { customerCode: string }) => d.customerCode,
      ),
    ).toHaveLength(2);

    const churn = (await admin.get('/api/v1/reports/churn?months=2')).body.data;
    expect(churn.months).toEqual([
      { period: '2026-11', newCustomers: 2, lostCustomers: 1 },
      { period: '2026-12', newCustomers: 0, lostCustomers: 0 },
    ]);
    expect(churn.now).toMatchObject({ active: 1, terminated: 1 });

    const back = await admin.post(`/api/v1/customers/${karim.id}/activate`).send({});
    expect(back.body.data.status).toBe('ACTIVE');
    expect(
      (await admin.get('/api/v1/reports/churn?months=2')).body.data.months[0].lostCustomers,
    ).toBe(0);
  });
});

describe('monthly summary SMS to the owner', () => {
  it('sends last month once, never twice, and nothing without a phone number', async () => {
    const karim = await addCustomer('Karim Mia', '01711223344', 'Mirpur');
    await ctx.billing.generateForPeriod();
    await pay(admin, karim.id, 50000);
    await expense({ amountPoisha: 10000 });

    ctx.clock.set('2026-12-01T04:00:00Z');
    expect(await ctx.reports.sendMonthlyDigest(ctx.sms, null)).toBeNull();
    expect(await ctx.reports.sendMonthlyDigest(ctx.sms, '01711000000')).toBe('2026-11');
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0]?.phone).toBe('01711000000');
    expect(ctx.sms.sent[0]?.message).toContain('2026-11');
    expect(ctx.sms.sent[0]?.message).toContain('আদায় ৳500');
    expect(ctx.sms.sent[0]?.message).toContain('খরচ ৳100');
    expect(ctx.sms.sent[0]?.message).toContain('লাভ ৳400');

    expect(await ctx.reports.sendMonthlyDigest(ctx.sms, '01711000000')).toBeNull();
    expect(ctx.sms.sent).toHaveLength(1);

    ctx.clock.set('2027-01-03T04:00:00Z');
    expect(await ctx.reports.sendMonthlyDigest(ctx.sms, '01711000000')).toBe('2026-12');
  });
});
