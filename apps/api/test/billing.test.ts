import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const PRICE = 50000; // 500 taka
let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  ctx.sms.sent.length = 0;
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: BigInt(PRICE) },
    })
  ).id;
});

async function addCustomer(policy = 'ACTIVATE_NOW', name = 'Karim Mia', phone = '01711223344') {
  const admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: policy,
  });
  return res.body.data as { id: string; customerCode: string };
}

const pay = (
  agent: Awaited<ReturnType<typeof loginAs>>,
  customerId: string,
  amountPoisha: number,
  extra = {},
) => agent.post('/api/v1/payments').send({ customerId, amountPoisha, method: 'CASH', ...extra });

describe('invoice generation', () => {
  it('issues one invoice per billable customer, due on the 10th, and is idempotent', async () => {
    await addCustomer('ACTIVATE_NOW', 'A One', '01711000001');
    await addCustomer('AFTER_FIRST_PAYMENT', 'B Two', '01711000002');
    const gone = await addCustomer('ACTIVATE_NOW', 'C Gone', '01711000003');
    await ctx.db.customer.update({ where: { id: gone.id }, data: { status: 'TERMINATED' } });

    expect(await ctx.billing.generateForPeriod()).toEqual({ period: '2026-11', created: 2 });
    expect(await ctx.billing.generateForPeriod()).toEqual({ period: '2026-11', created: 0 });

    const admin = await loginAs(ctx.app, ADMIN);
    const list = await admin.get('/api/v1/invoices?period=2026-11');
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0]).toMatchObject({
      amountPoisha: PRICE,
      paidPoisha: 0,
      dueDate: '2026-11-10',
      status: 'ISSUED',
    });
  });

  it('gives a late-created customer at least 3 days to pay', async () => {
    await addCustomer();
    ctx.clock.set('2026-11-14T04:00:00Z');
    await ctx.billing.generateForPeriod();
    const invoice = await ctx.db.invoice.findFirstOrThrow();
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe('2026-11-17');
  });

  it('refuses to bill a future month and lets only admin run billing', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const staff = await loginAs(ctx.app, STAFF);
    expect((await admin.post('/api/v1/invoices/generate').send({ period: '2027-01' })).status).toBe(
      400,
    );
    expect((await staff.post('/api/v1/invoices/generate').send({})).status).toBe(403);
    const ok = await admin.post('/api/v1/invoices/generate').send({});
    expect(ok.status).toBe(200);
  });
});

describe('payments', () => {
  it('allocates oldest invoice first and shows partial payment', async () => {
    const c = await addCustomer();
    ctx.clock.set('2026-10-02T04:00:00Z');
    await ctx.billing.generateForPeriod('2026-10');
    ctx.clock.set('2026-11-02T04:00:00Z');
    await ctx.billing.generateForPeriod('2026-11');

    const staff = await loginAs(ctx.app, STAFF);
    const res = await pay(staff, c.id, 75000);
    expect(res.status).toBe(201);
    expect(res.body.data.receiptNumber).toBe('R000001');
    expect(res.body.data.creditPoisha).toBe(0);
    expect(res.body.data.allocations).toEqual([
      { invoiceNumber: `INV-202610-${c.customerCode}`, amountPoisha: 50000 },
      { invoiceNumber: `INV-202611-${c.customerCode}`, amountPoisha: 25000 },
    ]);

    const billing = (await staff.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    expect(billing.outstandingPoisha).toBe(25000);
    expect(billing.invoices.map((i: { status: string }) => i.status)).toEqual([
      'PARTIALLY_PAID',
      'PAID',
    ]);
  });

  it('turns an overpayment into credit that pays the next invoice automatically', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod('2026-11');
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await pay(admin, c.id, 130000);
    expect(res.body.data.creditPoisha).toBe(80000);
    expect((await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data.creditPoisha).toBe(
      80000,
    );

    ctx.clock.set('2026-12-01T04:00:00Z');
    await ctx.billing.generateForPeriod();
    const billing = (await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    expect(billing.creditPoisha).toBe(30000);
    expect(billing.invoices[0]).toMatchObject({
      period: '2026-12',
      paidPoisha: 50000,
      status: 'PAID',
    });
  });

  it('activates an AFTER_FIRST_PAYMENT customer only when the first invoice is fully paid', async () => {
    const c = await addCustomer('AFTER_FIRST_PAYMENT');
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, c.id, 20000);
    expect((await ctx.db.customer.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      'PENDING_ACTIVATION',
    );
    await pay(admin, c.id, 30000);
    expect((await ctx.db.customer.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      'ACTIVE',
    );
    const actions = (await ctx.db.auditLog.findMany()).map((l) => l.action);
    expect(actions).toContain('CUSTOMER_ACTIVATED');
  });

  it('does not activate MANUAL-policy customers on payment', async () => {
    const c = await addCustomer('MANUAL');
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, c.id, PRICE);
    expect((await ctx.db.customer.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      'PENDING_ACTIVATION',
    );
  });

  it('keeps bKash entry admin-only, requires and de-duplicates the transaction ID', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    const staff = await loginAs(ctx.app, STAFF);
    const admin = await loginAs(ctx.app, ADMIN);
    const bkash = { method: 'BKASH', bkashTrxId: 'ab12cd34ef' };
    expect((await pay(staff, c.id, 10000, bkash)).status).toBe(403);
    expect((await pay(admin, c.id, 10000, { method: 'BKASH' })).status).toBe(400);
    const ok = await pay(admin, c.id, 10000, bkash);
    expect(ok.status).toBe(201);
    expect(ok.body.data.bkashTrxId).toBe('AB12CD34EF');
    expect(
      (await pay(admin, c.id, 10000, { method: 'BKASH', bkashTrxId: 'AB12CD34EF' })).status,
    ).toBe(409);
  });

  it('validates amounts and unknown customers', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    expect((await pay(admin, '00000000-0000-0000-0000-000000000000', 50000)).status).toBe(404);
    expect((await pay(admin, '00000000-0000-0000-0000-000000000000', 5)).status).toBe(400);
  });

  it('lets only admin see the global payment list', async () => {
    const c = await addCustomer();
    const staff = await loginAs(ctx.app, STAFF);
    await pay(staff, c.id, 10000);
    expect((await staff.get('/api/v1/payments')).status).toBe(403);
    const admin = await loginAs(ctx.app, ADMIN);
    const list = await admin.get('/api/v1/payments');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].receivedByName).toBe('Field One');
  });

  it('serialises concurrent payments for one customer without losing money', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    const results = await Promise.all([1, 2, 3, 4].map(() => pay(admin, c.id, 20000)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const billing = (await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    // 4 x 200 = 800 taka paid against a 500 taka invoice: 300 taka credit, nothing lost or double counted.
    expect(billing.outstandingPoisha).toBe(0);
    expect(billing.creditPoisha).toBe(80000 - PRICE);
  });
});

describe('payment reversal', () => {
  it('restores invoices and removes surplus credit', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    const paid = await pay(admin, c.id, 70000);
    const res = await admin
      .post(`/api/v1/payments/${paid.body.data.id}/reverse`)
      .send({ reason: 'Entered wrong amount' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REVERSED');
    const billing = (await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    expect(billing).toMatchObject({ creditPoisha: 0, outstandingPoisha: PRICE });
    expect(billing.invoices[0].status).toBe('ISSUED');
  });

  it('cannot reverse twice, only admin may reverse, and used credit blocks reversal', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    const staff = await loginAs(ctx.app, STAFF);
    const first = (await pay(admin, c.id, PRICE)).body.data;
    expect(
      (await staff.post(`/api/v1/payments/${first.id}/reverse`).send({ reason: 'oops' })).status,
    ).toBe(403);
    expect(
      (await admin.post(`/api/v1/payments/${first.id}/reverse`).send({ reason: 'mistake' })).status,
    ).toBe(200);
    expect(
      (await admin.post(`/api/v1/payments/${first.id}/reverse`).send({ reason: 'mistake' })).status,
    ).toBe(409);

    // Overpay, let next month consume the credit, then the original cannot be reversed anymore.
    const over = (await pay(admin, c.id, 100000)).body.data; // 500 invoice + 500 credit
    ctx.clock.set('2026-12-01T04:00:00Z');
    await ctx.billing.generateForPeriod();
    expect(
      (await admin.post(`/api/v1/payments/${over.id}/reverse`).send({ reason: 'mistake' })).status,
    ).toBe(409);
  });

  it('cancels the unsent payment SMS', async () => {
    const c = await addCustomer();
    const admin = await loginAs(ctx.app, ADMIN);
    const paid = (await pay(admin, c.id, 10000)).body.data;
    await admin.post(`/api/v1/payments/${paid.id}/reverse`).send({ reason: 'mistake' });
    const dispatched = await ctx.notifications.dispatchPending();
    expect(dispatched.sent).toBe(0);
    expect((await ctx.db.smsMessage.findFirstOrThrow()).status).toBe('CANCELLED');
  });
});

describe('SMS notifications', () => {
  it('sends a payment-received message once', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, c.id, 20000);
    expect(await ctx.notifications.dispatchPending()).toMatchObject({ sent: 1 });
    expect(await ctx.notifications.dispatchPending()).toMatchObject({ sent: 0 });
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0]?.phone).toBe('01711223344');
    expect(ctx.sms.sent[0]?.message).toContain('R000001');
    expect(ctx.sms.sent[0]?.message).toContain('300'); // remaining taka
  });

  it('queues reminders on the 8th (2 days) and 9th (1 day), once each, only for unpaid invoices', async () => {
    const unpaid = await addCustomer('ACTIVATE_NOW', 'Unpaid One', '01711000001');
    const paid = await addCustomer('ACTIVATE_NOW', 'Paid Two', '01711000002');
    const optOut = await addCustomer('ACTIVATE_NOW', 'Opt Out', '01711000003');
    await ctx.db.customer.update({ where: { id: optOut.id }, data: { smsOptOut: true } });
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, paid.id, PRICE);
    ctx.sms.sent.length = 0;
    await ctx.db.smsMessage.deleteMany();

    ctx.clock.set('2026-11-07T04:00:00Z');
    expect(await ctx.notifications.enqueueReminders()).toBe(0); // 3 days before: too early

    ctx.clock.set('2026-11-08T04:00:00Z');
    expect(await ctx.notifications.enqueueReminders()).toBe(1);
    expect(await ctx.notifications.enqueueReminders()).toBe(0); // idempotent
    ctx.clock.set('2026-11-09T04:00:00Z');
    expect(await ctx.notifications.enqueueReminders()).toBe(1);

    const types = (await ctx.db.smsMessage.findMany({ orderBy: { createdAt: 'asc' } })).map((m) => [
      m.type,
      m.customerId,
    ]);
    expect(types).toEqual([
      ['REMINDER_D2', unpaid.id],
      ['REMINDER_D1', unpaid.id],
    ]);

    ctx.clock.set('2026-11-09T05:00:00Z');
    expect((await ctx.notifications.dispatchPending()).sent).toBe(2);
    expect(ctx.sms.sent.every((m) => m.phone === '01711000001')).toBe(true);
  });

  it('cancels a reminder if the customer paid before it was sent', async () => {
    const c = await addCustomer();
    await ctx.billing.generateForPeriod();
    ctx.clock.set('2026-11-08T04:00:00Z');
    await ctx.notifications.enqueueReminders();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, c.id, PRICE);
    await ctx.db.smsMessage.updateMany({
      where: { type: 'PAYMENT_RECEIVED' },
      data: { status: 'CANCELLED' },
    });
    const result = await ctx.notifications.dispatchPending();
    expect(result).toMatchObject({ sent: 0, cancelled: 1 });
  });

  it('holds messages outside 08:00-21:00 Dhaka time', async () => {
    const c = await addCustomer();
    const admin = await loginAs(ctx.app, ADMIN);
    ctx.clock.set('2026-11-02T16:30:00Z'); // 22:30 Dhaka
    await pay(admin, c.id, 10000);
    expect(await ctx.notifications.dispatchPending()).toMatchObject({
      sent: 0,
      skippedReason: 'outside-window',
    });
    ctx.clock.set('2026-11-03T03:00:00Z'); // 09:00 Dhaka next day
    expect((await ctx.notifications.dispatchPending()).sent).toBe(1);
  });

  it('retries after a gateway failure and gives up after 5 attempts', async () => {
    const c = await addCustomer();
    const admin = await loginAs(ctx.app, ADMIN);
    await pay(admin, c.id, 10000);
    ctx.sms.failNext = true;
    expect(await ctx.notifications.dispatchPending()).toMatchObject({ sent: 0, failed: 1 });
    expect((await ctx.db.smsMessage.findFirstOrThrow()).status).toBe('PENDING');
    expect((await ctx.notifications.dispatchPending()).sent).toBe(1);

    await ctx.db.smsMessage.updateMany({ data: { status: 'PENDING', attempts: 4 } });
    ctx.sms.failNext = true;
    await ctx.notifications.dispatchPending();
    expect((await ctx.db.smsMessage.findFirstOrThrow()).status).toBe('FAILED');
  });

  it('stops sending once the monthly cap is reached', async () => {
    const capped = createTestContext({ SMS_MONTHLY_CAP: '1' });
    try {
      await resetDatabase(capped.db);
      await seedUsers(capped.db);
      const pkg = await capped.db.package.create({
        data: { name: 'P', speedMbps: 5, monthlyPricePoisha: 50000n },
      });
      const admin = await loginAs(capped.app, ADMIN);
      for (const phone of ['01711000001', '01711000002']) {
        const created = await admin.post('/api/v1/customers').send({
          fullName: `Cap ${phone}`,
          phone,
          address: 'Somewhere 1',
          packageId: pkg.id,
          connectionType: 'DHCP',
          activationPolicy: 'ACTIVATE_NOW',
        });
        await admin
          .post('/api/v1/payments')
          .send({ customerId: created.body.data.id, amountPoisha: 10000, method: 'CASH' });
      }
      expect((await capped.notifications.dispatchPending()).sent).toBe(1);
      expect(await capped.notifications.dispatchPending()).toMatchObject({
        sent: 0,
        skippedReason: 'monthly-cap',
      });
    } finally {
      await capped.close();
    }
  });
});
