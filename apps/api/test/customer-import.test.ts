import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let admin: Awaited<ReturnType<typeof loginAs>>;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  await ctx.db.package.create({
    data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
  });
  await ctx.db.package.create({
    data: { name: 'Old plan', speedMbps: 5, monthlyPricePoisha: 30000n, isActive: false },
  });
  admin = await loginAs(ctx.app, ADMIN);
});

const HEADER =
  'customer_id,name,phone,address,area,package,connection_type,pppoe_username,router,status';
const send = (csv: string, commit: boolean) =>
  admin.post('/api/v1/customers/import').send({ csv, commit, fileName: 'old-customers.csv' });

describe('customer import', () => {
  it('checks a good file without saving anything, then saves it when committed', async () => {
    const csv = [
      HEADER,
      'ISP-1001,Karim Mia,01711223344,House 5 Road 2,Mirpur,Home 10,PPPOE,karim01,,ACTIVE',
      'ISP-1002,Rahim Uddin,+8801811223355,House 9,Uttara,home 10,,rahim02,,',
      'ISP-1003,Salma Begum,01911223366,Flat 3,Mirpur,Home 10,DHCP,,,SUSPENDED',
    ].join('\n');

    const check = await send(csv, false);
    expect(check.status).toBe(200);
    expect(check.body.data).toMatchObject({
      committed: false,
      totalRows: 3,
      validRows: 3,
      errorCount: 0,
    });
    expect(await ctx.db.customer.count()).toBe(0);

    const saved = await send(csv, true);
    expect(saved.body.data).toMatchObject({ committed: true, created: 3 });
    const customers = await ctx.db.customer.findMany({
      include: { subscription: true },
      orderBy: { customerCode: 'asc' },
    });
    expect(customers.map((c) => c.customerCode)).toEqual(['ISP-1001', 'ISP-1002', 'ISP-1003']);
    expect(customers[1]).toMatchObject({ phone: '01811223355', status: 'ACTIVE' });
    expect(customers[1]?.subscription).toMatchObject({
      connectionType: 'PPPOE',
      pppoeUsername: 'rahim02',
    });
    expect(customers[2]).toMatchObject({ status: 'SUSPENDED', suspendReason: 'MANUAL' });
    expect(customers[2]?.subscription?.connectionType).toBe('DHCP');
  });

  it('saves nothing when any row has a problem, and says which line and field', async () => {
    const csv = [
      HEADER,
      'A1,Good One,01711223344,House 5,Mirpur,Home 10,PPPOE,good01,,',
      'A2,X,0171,House 5,,Nope,PPPOE,,,',
      'A1,Dup Id,01711223399,House 5,,Home 10,PPPOE,good01,,',
      'A4,Old Plan,01711223388,House 5,,Old plan,PPPOE,old04,,PAUSED',
    ].join('\n');
    const res = await send(csv, true);
    expect(res.body.data.committed).toBe(false);
    expect(res.body.data.validRows).toBe(1);
    const problems = res.body.data.errors as Array<{ row: number; field: string; message: string }>;
    const has = (row: number, field: string) =>
      problems.some((p) => p.row === row && p.field === field);
    expect(has(3, 'name')).toBe(true);
    expect(has(3, 'phone')).toBe(true);
    expect(has(3, 'package')).toBe(true);
    expect(has(3, 'pppoe_username')).toBe(true);
    expect(has(4, 'customer_id')).toBe(true); // repeats line 2
    expect(has(4, 'pppoe_username')).toBe(true);
    expect(has(5, 'package')).toBe(true); // inactive
    expect(has(5, 'status')).toBe(true);
    expect(await ctx.db.customer.count()).toBe(0);
  });

  it('rejects IDs and PPPoE usernames that already exist, ignoring letter case', async () => {
    await send(`${HEADER}\nISP-1,Karim Mia,01711223344,House 5,,Home 10,PPPOE,karim01,,`, true);
    const res = await send(
      `${HEADER}\nisp-1,Other Person,01811223355,House 9,,Home 10,PPPOE,KARIM01,,`,
      false,
    );
    const fields = (res.body.data.errors as Array<{ field: string }>).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['customer_id', 'pppoe_username']));
  });

  it('keeps generated IDs from colliding with imported ones', async () => {
    await send(
      `${HEADER}\nC00001,Karim Mia,01711223344,House 5,,Home 10,PPPOE,karim01,,\nC00120,Rahim,01811223355,House 5,,Home 10,PPPOE,rahim01,,`,
      true,
    );
    const created = await admin.post('/api/v1/customers').send({
      fullName: 'New Person',
      phone: '01911223366',
      address: 'House 7',
      packageId: (await ctx.db.package.findFirstOrThrow({ where: { name: 'Home 10' } })).id,
      connectionType: 'DHCP',
      activationPolicy: 'ACTIVATE_NOW',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.customerCode).toBe('C00121');
  });

  it('does not touch routers or send messages for imported customers', async () => {
    const router = await admin.post('/api/v1/routers').send({
      name: 'Core-1',
      driver: 'REST',
      host: '10.0.0.1',
      port: 443,
      useTls: true,
      allowSelfSigned: true,
      username: 'api',
      password: 'pw',
    });
    const csv = `${HEADER}\nISP-1,Karim Mia,01711223344,House 5,,Home 10,PPPOE,karim01,Core-1,`;
    const res = await send(csv, true);
    expect(res.body.data.created).toBe(1);
    expect(router.status).toBe(201);
    expect(await ctx.db.networkJob.count()).toBe(0);
    expect(await ctx.db.smsMessage.count()).toBe(0);
    const sub = await ctx.db.subscription.findFirstOrThrow();
    expect(sub.routerId).toBe(router.body.data.router.id);
  });

  it('explains a file with missing columns, and is admin-only and audited', async () => {
    const bad = await send('name,phone\nKarim,01711223344', false);
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/columns are missing.*customer id/);

    const staff = await loginAs(ctx.app, STAFF);
    expect(
      (await staff.post('/api/v1/customers/import').send({ csv: HEADER, commit: false })).status,
    ).toBe(403);

    await send(`${HEADER}\nISP-1,Karim Mia,01711223344,House 5,,Home 10,PPPOE,karim01,,`, true);
    const log = await ctx.db.auditLog.findFirst({ where: { action: 'CUSTOMERS_IMPORTED' } });
    expect(log?.metadata).toMatchObject({ count: 1, fileName: 'old-customers.csv' });
  });

  it('imports a realistic customer list quickly in one go', async () => {
    const lines = [HEADER];
    for (let i = 1; i <= 2500; i += 1) {
      const phone = `017${String(10_000_000 + i)}`;
      lines.push(
        `ISP-${i},Customer ${i},${phone},House ${i} Road 1,Area ${i % 20},Home 10,PPPOE,user${i},,`,
      );
    }
    const started = Date.now();
    const res = await send(lines.join('\n'), true);
    expect(res.body.data).toMatchObject({ committed: true, created: 2500 });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
