import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-13T05:00:00Z');
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
});

async function addCustomer(name: string, phone: string) {
  const admin = await loginAs(ctx.app, ADMIN);
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

describe('free / VIP lines', () => {
  it('gets a 0 bill, is never auto-suspended, and only an admin can set it', async () => {
    const mosque = await addCustomer('Central Mosque', '01711111111');
    const normal = await addCustomer('Babul Mia', '01722222222');
    const staff = await loginAs(ctx.app, STAFF);
    expect(
      (await staff.patch(`/api/v1/customers/${mosque.id}`).send({ isFree: true })).status,
    ).toBe(403);
    const admin = await loginAs(ctx.app, ADMIN);
    const set = await admin.patch(`/api/v1/customers/${mosque.id}`).send({ isFree: true });
    expect(set.status).toBe(200);
    expect(set.body.data.isFree).toBe(true);

    await ctx.billing.generateForPeriod();
    const free = await ctx.db.invoice.findFirstOrThrow({ where: { customerId: mosque.id } });
    expect(free.amountPoisha).toBe(0n);
    expect(free.status).toBe('PAID');
    const paying = await ctx.db.invoice.findFirstOrThrow({ where: { customerId: normal.id } });
    expect(paying.amountPoisha).toBe(50000n);

    // Even an old unpaid bill never suspends a free line.
    await ctx.db.invoice.create({
      data: {
        invoiceNumber: 'INV-OLD-1',
        customerId: mosque.id,
        period: new Date('2026-09-01'),
        amountPoisha: 50000n,
        dueDate: new Date('2026-09-10'),
        status: 'ISSUED',
        issuedAt: new Date('2026-09-01'),
      },
    });
    await ctx.db.invoice.update({
      where: { id: paying.id },
      data: { dueDate: new Date('2026-10-01') },
    });
    ctx.clock.set('2026-11-20T05:00:00Z');
    await ctx.customerStatus.autoSuspendOverdue(3);
    expect((await ctx.db.customer.findUniqueOrThrow({ where: { id: mosque.id } })).status).toBe(
      'ACTIVE',
    );
    expect((await ctx.db.customer.findUniqueOrThrow({ where: { id: normal.id } })).status).toBe(
      'SUSPENDED',
    );
  });
});

describe('global search', () => {
  it('finds by name, customer ID and phone and reports dues', async () => {
    const a = await addCustomer('Anwar Hossain', '01711223344');
    await addCustomer('Babul Mia', '01755667788');
    await ctx.billing.generateForPeriod();
    const staff = await loginAs(ctx.app, STAFF);

    const byName = await staff.get('/api/v1/search?q=anwar');
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0]).toMatchObject({
      id: a.id,
      dueAmountPoisha: 50000,
      online: null,
      isFree: false,
    });
    expect((await staff.get(`/api/v1/search?q=${a.customerCode}`)).body.data[0].id).toBe(a.id);
    expect((await staff.get('/api/v1/search?q=0175566')).body.data[0].fullName).toBe('Babul Mia');
    expect((await staff.get('/api/v1/search?q=%25')).body.data).toHaveLength(0);
    expect((await staff.get('/api/v1/search?q=')).status).toBe(400);
  });

  it('needs a login', async () => {
    const res = await (await import('supertest')).default(ctx.app).get('/api/v1/search?q=a');
    expect(res.status).toBe(401);
  });
});
