import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  const pkg = await ctx.db.package.create({
    data: { name: '10 Mbps', speedMbps: 10, monthlyPricePoisha: 50000n, pppProfile: 'p10' },
  });
  packageId = pkg.id;
});

const lead = {
  fullName: 'Karim Mia',
  phone: '+8801711223344',
  address: 'House 5, Road 2',
  area: 'Uttara',
};
const approval = () => ({
  packageId,
  connectionType: 'PPPOE',
  pppoeUsername: 'karim01',
  activationPolicy: 'AFTER_FIRST_PAYMENT',
});

describe('packages', () => {
  it('lets admin create/update, staff only read active ones', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const created = await admin
      .post('/api/v1/packages')
      .send({ name: '20 Mbps', speedMbps: 20, monthlyPricePoisha: 80000 });
    expect(created.status).toBe(201);
    expect(created.body.data.monthlyPricePoisha).toBe(80000);
    expect(
      (
        await admin
          .post('/api/v1/packages')
          .send({ name: '20 Mbps', speedMbps: 20, monthlyPricePoisha: 1 })
      ).status,
    ).toBe(409);

    await admin.patch(`/api/v1/packages/${created.body.data.id}`).send({ isActive: false });
    expect((await admin.get('/api/v1/packages')).body.data).toHaveLength(2);

    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get('/api/v1/packages')).body.data).toHaveLength(1);
    expect(
      (
        await staff
          .post('/api/v1/packages')
          .send({ name: 'x1', speedMbps: 1, monthlyPricePoisha: 1 })
      ).status,
    ).toBe(403);
  });
});

describe('leads', () => {
  it('staff submit leads, see only their own; admin sees all', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    const created = await staff.post('/api/v1/leads').send(lead);
    expect(created.status).toBe(201);
    expect(created.body.data.phone).toBe('01711223344');
    expect(created.body.data.status).toBe('PENDING');

    const admin = await loginAs(ctx.app, ADMIN);
    await admin.post('/api/v1/leads').send({ ...lead, fullName: 'Admin Entered' });
    expect((await staff.get('/api/v1/leads')).body.data).toHaveLength(1);
    expect((await admin.get('/api/v1/leads')).body.data).toHaveLength(2);
  });

  it('rejects invalid phone numbers', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    const res = await staff.post('/api/v1/leads').send({ ...lead, phone: '12345' });
    expect(res.status).toBe(400);
  });

  it('staff cannot approve or reject', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    const id = (await staff.post('/api/v1/leads').send(lead)).body.data.id;
    expect((await staff.post(`/api/v1/leads/${id}/approve`).send(approval())).status).toBe(403);
    expect((await staff.post(`/api/v1/leads/${id}/reject`).send({ reason: 'no' })).status).toBe(
      403,
    );
  });

  it('approval creates a pending customer with a generated ID and links the lead', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    const admin = await loginAs(ctx.app, ADMIN);
    const id = (await staff.post('/api/v1/leads').send(lead)).body.data.id;

    const res = await admin.post(`/api/v1/leads/${id}/approve`).send(approval());
    expect(res.status).toBe(200);
    expect(res.body.data.lead.status).toBe('APPROVED');
    const customer = res.body.data.customer;
    expect(customer.customerCode).toMatch(/^C\d{5}$/);
    expect(customer.status).toBe('PENDING_ACTIVATION');
    expect(customer.subscription).toMatchObject({
      packageName: '10 Mbps',
      pppoeUsername: 'karim01',
      activationPolicy: 'AFTER_FIRST_PAYMENT',
    });
    expect(res.body.data.lead.customerId).toBe(customer.id);
  });

  it('ACTIVATE_NOW makes the customer ACTIVE immediately', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const id = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const res = await admin
      .post(`/api/v1/leads/${id}/approve`)
      .send({ ...approval(), activationPolicy: 'ACTIVATE_NOW' });
    expect(res.body.data.customer.status).toBe('ACTIVE');
  });

  it('keeps a supplied existing customer ID verbatim and blocks duplicates ignoring case', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const first = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const second = (await admin.post('/api/v1/leads').send({ ...lead, fullName: 'Second Person' }))
      .body.data.id;

    const ok = await admin
      .post(`/api/v1/leads/${first}/approve`)
      .send({ ...approval(), customerCode: 'Old-0042' });
    expect(ok.body.data.customer.customerCode).toBe('Old-0042');

    const dup = await admin
      .post(`/api/v1/leads/${second}/approve`)
      .send({ ...approval(), customerCode: 'OLD-0042', pppoeUsername: 'other' });
    expect(dup.status).toBe(409);
    // The failed approval must leave the lead pending (transaction rolled back).
    const stillPending = await ctx.db.lead.findUniqueOrThrow({ where: { id: second } });
    expect(stillPending.status).toBe('PENDING');
  });

  it('blocks a reused PPPoE username and requires one for PPPoE', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const a = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const b = (await admin.post('/api/v1/leads').send({ ...lead, fullName: 'Other One' })).body.data
      .id;
    await admin.post(`/api/v1/leads/${a}/approve`).send(approval());
    expect(
      (
        await admin
          .post(`/api/v1/leads/${b}/approve`)
          .send({ ...approval(), pppoeUsername: 'KARIM01' })
      ).status,
    ).toBe(409);
    const missing = await admin
      .post(`/api/v1/leads/${b}/approve`)
      .send({ ...approval(), pppoeUsername: '' });
    expect(missing.status).toBe(400);
  });

  it('cannot approve twice, nor approve after rejection, and generates sequential codes', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const a = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const b = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const c = (await admin.post('/api/v1/leads').send(lead)).body.data.id;

    const first = await admin.post(`/api/v1/leads/${a}/approve`).send(approval());
    expect(
      (
        await admin
          .post(`/api/v1/leads/${a}/approve`)
          .send({ ...approval(), pppoeUsername: 'again' })
      ).status,
    ).toBe(409);
    const second = await admin
      .post(`/api/v1/leads/${b}/approve`)
      .send({ ...approval(), pppoeUsername: 'second' });
    expect(first.body.data.customer.customerCode).toBe('C00001');
    expect(second.body.data.customer.customerCode).toBe('C00002');

    expect(
      (await admin.post(`/api/v1/leads/${c}/reject`).send({ reason: 'Out of coverage' })).body.data
        .status,
    ).toBe('REJECTED');
    expect(
      (
        await admin
          .post(`/api/v1/leads/${c}/approve`)
          .send({ ...approval(), pppoeUsername: 'third' })
      ).status,
    ).toBe(409);
  });

  it('generated codes skip IDs already taken by imported customers', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const a = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    const b = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    await admin.post(`/api/v1/leads/${a}/approve`).send({ ...approval(), customerCode: 'c00001' });
    const res = await admin
      .post(`/api/v1/leads/${b}/approve`)
      .send({ ...approval(), pppoeUsername: 'next' });
    expect(res.body.data.customer.customerCode).toBe('C00002');
  });

  it('rejects approval with an inactive package and writes audit rows', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const id = (await admin.post('/api/v1/leads').send(lead)).body.data.id;
    await ctx.db.package.update({ where: { id: packageId }, data: { isActive: false } });
    expect((await admin.post(`/api/v1/leads/${id}/approve`).send(approval())).status).toBe(400);
    await ctx.db.package.update({ where: { id: packageId }, data: { isActive: true } });
    await admin.post(`/api/v1/leads/${id}/approve`).send(approval());
    const actions = (await ctx.db.auditLog.findMany()).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['LEAD_CREATED', 'LEAD_APPROVED']));
  });
});

describe('customers', () => {
  const direct = () => ({
    fullName: 'Direct Customer',
    phone: '01811223344',
    address: 'Somewhere 1',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'MANUAL',
  });

  it('admin creates directly with the same activation policy; non-PPPoE needs no username', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await admin.post('/api/v1/customers').send(direct());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING_ACTIVATION', customerCode: 'C00001' });
  });

  it('staff can search and view but not create or edit', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const created = (await admin.post('/api/v1/customers').send(direct())).body.data;
    const staff = await loginAs(ctx.app, STAFF);

    expect((await staff.get('/api/v1/customers?search=direct')).body.data).toHaveLength(1);
    expect((await staff.get('/api/v1/customers?search=01811')).body.data).toHaveLength(1);
    expect((await staff.get('/api/v1/customers?search=nobody')).body.data).toHaveLength(0);
    expect((await staff.get(`/api/v1/customers/${created.id}`)).body.data.customerCode).toBe(
      'C00001',
    );
    expect((await staff.post('/api/v1/customers').send(direct())).status).toBe(403);
    expect((await staff.patch(`/api/v1/customers/${created.id}`).send({ note: 'x' })).status).toBe(
      403,
    );
  });

  it('admin edits contact fields and filters by status', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const created = (await admin.post('/api/v1/customers').send(direct())).body.data;
    const edited = await admin
      .patch(`/api/v1/customers/${created.id}`)
      .send({ area: 'Mirpur', altPhone: '01911223344' });
    expect(edited.body.data).toMatchObject({ area: 'Mirpur', altPhone: '01911223344' });
    expect((await admin.get('/api/v1/customers?status=ACTIVE')).body.data).toHaveLength(0);
    expect(
      (await admin.get('/api/v1/customers?status=PENDING_ACTIVATION')).body.meta.pagination.total,
    ).toBe(1);
  });

  it('returns 404 for an unknown customer and 400 for a bad id', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    expect((await admin.get('/api/v1/customers/00000000-0000-0000-0000-000000000000')).status).toBe(
      404,
    );
    expect((await admin.get('/api/v1/customers/not-an-id')).status).toBe(400);
  });
});
