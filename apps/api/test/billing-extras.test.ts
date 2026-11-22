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

async function addCustomer(name: string, phone: string) {
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; customerCode: string };
}

async function billing(customerId: string) {
  return (await admin.get(`/api/v1/customers/${customerId}/billing`)).body.data;
}

const setSettings = (prorateNewCustomers: boolean) =>
  admin.put('/api/v1/billing-settings').send({
    prorateNewCustomers,
    business: { name: 'Sky Net', address: 'Dhaka', phone: '01700000000', footer: 'Thanks' },
  });

describe('standing monthly discount', () => {
  it('reduces every new invoice and shows as its own line', async () => {
    const c = await addCustomer('Karim', '01711223344');
    const set = await admin
      .put(`/api/v1/adjustments/customers/${c.id}/discount`)
      .send({ monthlyDiscountPoisha: 10000, note: 'Staff relative' });
    expect(set.status).toBe(204);
    await ctx.billing.generateForPeriod();

    const data = await billing(c.id);
    expect(data.monthlyNetPoisha).toBe(40000);
    expect(data.invoices[0].amountPoisha).toBe(40000);
    const detail = await admin.get(`/api/v1/invoices/${data.invoices[0].id}`);
    expect(detail.body.data.lines).toEqual([
      { kind: 'PACKAGE', description: 'Home 10', amountPoisha: 50000 },
      { kind: 'DISCOUNT', description: 'Staff relative', amountPoisha: -10000 },
    ]);
  });

  it('is admin-only unless the right is granted', async () => {
    const c = await addCustomer('Karim', '01711223344');
    const res = await staff
      .put(`/api/v1/adjustments/customers/${c.id}/discount`)
      .send({ monthlyDiscountPoisha: 100 });
    expect(res.status).toBe(403);
  });
});

describe('one-time charges and discounts', () => {
  it('waits for the next invoice when none exists yet, then bills it', async () => {
    const c = await addCustomer('Karim', '01711223344');
    const added = await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Connection fee', amountPoisha: 100000 });
    expect(added.status).toBe(201);
    expect(added.body.data.status).toBe('PENDING');

    await ctx.billing.generateForPeriod();
    const data = await billing(c.id);
    expect(data.invoices[0].amountPoisha).toBe(150000);
    expect(data.charges[0]).toMatchObject({
      status: 'BILLED',
      invoiceNumber: data.invoices[0].invoiceNumber,
    });
  });

  it("goes straight onto this month's invoice when it already exists", async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.billing.generateForPeriod();
    const added = await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Router', amountPoisha: 120000 });
    expect(added.body.data.status).toBe('BILLED');
    expect((await billing(c.id)).invoices[0].amountPoisha).toBe(170000);
    expect((await billing(c.id)).outstandingPoisha).toBe(170000);
  });

  it('allows a discount only up to what is still unpaid, and cancels only waiting charges', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 30000, method: 'CASH' });

    const tooBig = await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Waiver', amountPoisha: -30000 });
    expect(tooBig.status).toBe(400);

    const fits = await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Waiver', amountPoisha: -20000 });
    expect(fits.status).toBe(201);
    const after = await billing(c.id);
    expect(after.invoices[0]).toMatchObject({
      amountPoisha: 30000,
      paidPoisha: 30000,
      status: 'PAID',
    });

    expect((await admin.delete(`/api/v1/adjustments/charges/${fits.body.data.id}`)).status).toBe(
      409,
    );
  });

  it('cancels a charge that has not been billed', async () => {
    const c = await addCustomer('Karim', '01711223344');
    const added = await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Fine', amountPoisha: 5000 });
    expect((await admin.delete(`/api/v1/adjustments/charges/${added.body.data.id}`)).status).toBe(
      204,
    );
    await ctx.billing.generateForPeriod();
    expect((await billing(c.id)).invoices[0].amountPoisha).toBe(50000);
  });

  it('trims a discount larger than the bill and carries the rest forward', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await admin
      .post(`/api/v1/adjustments/customers/${c.id}/charges`)
      .send({ description: 'Free months', amountPoisha: -80000 });
    await ctx.billing.generateForPeriod();
    const data = await billing(c.id);
    expect(data.invoices[0]).toMatchObject({ amountPoisha: 0, status: 'PAID' });
    const waiting = data.charges.find((x: { status: string }) => x.status === 'PENDING');
    expect(waiting.amountPoisha).toBe(-30000);
  });
});

describe('advance payment', () => {
  it('turns surplus into credit that pays the coming months', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 150000, method: 'CASH' });
    expect((await billing(c.id)).creditPoisha).toBe(100000);

    ctx.clock.set('2026-12-01T04:00:00Z');
    await ctx.billing.generateForPeriod();
    const data = await billing(c.id);
    expect(data.creditPoisha).toBe(50000);
    expect(data.invoices[0]).toMatchObject({ period: '2026-12', status: 'PAID' });
  });
});

describe('prorated bills', () => {
  it('bills a new customer only for the days left, when switched on', async () => {
    expect((await setSettings(true)).status).toBe(200);
    ctx.clock.set('2026-11-16T04:00:00Z');
    const joined = await addCustomer('New', '01711000001');
    // A customer loaded by the import has no join date and always pays the full month.
    const imported = await ctx.db.customer.create({
      data: {
        customerCode: 'OLD1',
        fullName: 'Old',
        phone: '01711000002',
        address: 'x',
        status: 'ACTIVE',
        subscription: {
          create: { packageId, connectionType: 'DHCP', activationPolicy: 'ACTIVATE_NOW' },
        },
      },
    });
    await ctx.billing.generateForPeriod();
    expect((await billing(joined.id)).invoices[0].amountPoisha).toBe(25000); // 15 of 30 days (16th to 30th)
    expect((await billing(imported.id)).invoices[0].amountPoisha).toBe(50000);
  });

  it('keeps the full month when switched off', async () => {
    ctx.clock.set('2026-11-16T04:00:00Z');
    const joined = await addCustomer('New', '01711000001');
    await ctx.billing.generateForPeriod();
    expect((await billing(joined.id)).invoices[0].amountPoisha).toBe(50000);
  });

  it('takes off the unused days when a customer leaves, only from the unpaid part', async () => {
    const c = await addCustomer('Karim', '01711223344');
    const paid = await addCustomer('Rahim', '01711223355');
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: paid.id, amountPoisha: 50000, method: 'CASH' });

    ctx.clock.set('2026-11-11T04:00:00Z'); // day 11 used, 19 of 30 days unused
    const left = await admin
      .post(`/api/v1/customers/${c.id}/terminate`)
      .send({ note: 'moved', prorateBill: true });
    expect(left.status).toBe(200);
    expect((await billing(c.id)).invoices[0].amountPoisha).toBe(18334);

    await admin.post(`/api/v1/customers/${paid.id}/terminate`).send({ prorateBill: true });
    expect((await billing(paid.id)).invoices[0].amountPoisha).toBe(50000);
  });
});

describe('moving a payment', () => {
  it("reopens the wrong customer's bill and pays the right customer's bill", async () => {
    const wrong = await addCustomer('Wrong', '01711000001');
    const right = await addCustomer('Right', '01711000002');
    await ctx.billing.generateForPeriod();
    const pay = await admin
      .post('/api/v1/payments')
      .send({ customerId: wrong.id, amountPoisha: 60000, method: 'CASH' });
    const receipt = pay.body.data.receiptNumber;
    expect((await billing(wrong.id)).creditPoisha).toBe(10000);

    const moved = await admin
      .post(`/api/v1/payments/${pay.body.data.id}/move`)
      .send({ toCustomerId: right.id, reason: 'Entered on the wrong ID' });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ receiptNumber: receipt, customerId: right.id });

    const a = await billing(wrong.id);
    expect(a.creditPoisha).toBe(0);
    expect(a.invoices[0]).toMatchObject({ paidPoisha: 0, status: 'ISSUED' });
    const b = await billing(right.id);
    expect(b.creditPoisha).toBe(10000);
    expect(b.invoices[0]).toMatchObject({ paidPoisha: 50000, status: 'PAID' });

    const log = await admin.get('/api/v1/audit-logs');
    expect(log.body.data.some((r: { action: string }) => r.action === 'PAYMENT_MOVED')).toBe(true);
  });

  it('refuses the same customer, a staff member, and a payment whose surplus was already spent', async () => {
    const a = await addCustomer('Anwar', '01711000001');
    const b = await addCustomer('Babul', '01711000002');
    await ctx.billing.generateForPeriod();
    const pay = await admin
      .post('/api/v1/payments')
      .send({ customerId: a.id, amountPoisha: 100000, method: 'CASH' });
    const url = `/api/v1/payments/${pay.body.data.id}/move`;

    expect((await admin.post(url).send({ toCustomerId: a.id, reason: 'same one' })).status).toBe(
      409,
    );
    expect((await staff.post(url).send({ toCustomerId: b.id, reason: 'try it' })).status).toBe(403);

    ctx.clock.set('2026-12-01T04:00:00Z');
    await ctx.billing.generateForPeriod(); // the 50000 surplus pays December
    expect((await admin.post(url).send({ toCustomerId: b.id, reason: 'late fix' })).status).toBe(
      409,
    );
  });
});

describe('receipt, invoice detail and settings', () => {
  it('returns what a printed receipt and invoice need', async () => {
    const c = await addCustomer('Karim', '01711223344');
    await ctx.billing.generateForPeriod();
    const pay = await admin
      .post('/api/v1/payments')
      .send({ customerId: c.id, amountPoisha: 20000, method: 'CASH', note: 'on the way' });

    const receipt = await staff.get(`/api/v1/payments/${pay.body.data.id}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({
      customerPhone: '01711223344',
      customerAddress: 'House 5, Road 2',
      outstandingPoisha: 30000,
      note: 'on the way',
    });

    const inv = (await billing(c.id)).invoices[0];
    const detail = await staff.get(`/api/v1/invoices/${inv.id}`);
    expect(detail.body.data.payments).toHaveLength(1);
    expect(detail.body.data.payments[0].receiptNumber).toBe(pay.body.data.receiptNumber);
  });

  it('shows business details to everyone but lets only an admin change them', async () => {
    expect((await staff.get('/api/v1/billing-settings')).body.data.business.name).toBe(
      'Internet Service',
    );
    expect((await setSettings(true)).status).toBe(200);
    const read = await staff.get('/api/v1/billing-settings');
    expect(read.body.data).toMatchObject({
      prorateNewCustomers: true,
      business: { name: 'Sky Net' },
    });
    const denied = await staff
      .put('/api/v1/billing-settings')
      .send({ prorateNewCustomers: false, business: { name: 'Hack' } });
    expect(denied.status).toBe(403);
  });
});
