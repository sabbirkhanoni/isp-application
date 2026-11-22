import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const PRICE = 50000;
let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-13T04:00:00Z');
  ctx.sms.sent.length = 0;
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: BigInt(PRICE) },
    })
  ).id;
});

async function addCustomer(name: string, phone: string, customerCode?: string) {
  const admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
    ...(customerCode ? { customerCode } : {}),
  });
  return res.body.data as { id: string; customerCode: string };
}

const HEADER = 'TrxID,Date,Sender,Reference,Amount,Status';
const line = (trx: string, ref: string, amount: number | string, sender = '01999000111') =>
  `${trx},13/11/2026 10:30:00,${sender},${ref},${amount},Completed`;
const statement = (...rows: string[]) => [HEADER, ...rows].join('\n');

async function upload(agent: Awaited<ReturnType<typeof loginAs>>, csv: string, offset = 0) {
  return agent.post('/api/v1/bkash/imports').send({ fileName: 'statement.csv', csv, offset });
}

describe('bKash statement import', () => {
  it('credits matching references automatically, once, even if the file is uploaded again', async () => {
    const c = await addCustomer('Karim Mia', '01711223344', 'Old-001');
    await ctx.billing.generateForPeriod();
    const admin = await loginAs(ctx.app, ADMIN);

    const csv = statement(line('AAA11111BB', ' old-001 ', 500));
    const first = await upload(admin, csv);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      totalRows: 1,
      posted: 1,
      needsReview: 0,
      duplicates: 0,
    });

    const billing = (await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    expect(billing.outstandingPoisha).toBe(0);
    expect(billing.payments[0]).toMatchObject({
      method: 'BKASH',
      bkashTrxId: 'AAA11111BB',
      amountPoisha: 50000,
    });

    const again = await upload(admin, csv);
    expect(again.body.data).toMatchObject({ posted: 0, duplicates: 1 });
    expect(await ctx.db.payment.count()).toBe(1);

    // The customer also gets the normal "payment received" SMS.
    expect((await ctx.notifications.dispatchPending()).sent).toBe(1);
  });

  it('handles overlapping statements: only new transactions are processed', async () => {
    const c = await addCustomer('Karim Mia', '01711223344', 'K1');
    const admin = await loginAs(ctx.app, ADMIN);
    await upload(admin, statement(line('AAA11111BB', 'K1', 100), line('BBB11111CC', 'K1', 200)));
    const second = await upload(
      admin,
      statement(line('BBB11111CC', 'K1', 200), line('CCC11111DD', 'K1', 300)),
    );
    expect(second.body.data).toMatchObject({ posted: 1, duplicates: 1 });
    const billing = (await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data;
    expect(billing.creditPoisha).toBe(60000); // no invoices yet: 100+200+300 taka all credit
  });

  it('queues unknown references, suggesting a customer only when the sender number is unambiguous', async () => {
    const solo = await addCustomer('Solo One', '01711000001');
    await addCustomer('Twin A', '01711000002');
    await addCustomer('Twin B', '01711000002');
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await upload(
      admin,
      statement(
        line('AAA11111BB', 'who is this', 500, '+8801711000001'),
        line('BBB11111CC', '', 500, '01711000002'),
        line('CCC11111DD', 'nope', 500, '01555000000'),
      ),
    );
    expect(res.body.data).toMatchObject({ posted: 0, needsReview: 3 });
    const queue = (await admin.get('/api/v1/bkash/transactions?status=NEEDS_REVIEW')).body;
    expect(queue.meta.needsReview).toBe(3);
    const byTrx = Object.fromEntries(queue.data.map((t: { trxId: string }) => [t.trxId, t]));
    expect(byTrx['AAA11111BB']).toMatchObject({
      reviewReason: 'PHONE_SUGGESTION',
      suggestedCustomer: { id: solo.id },
    });
    expect(byTrx['BBB11111CC']).toMatchObject({
      reviewReason: 'NO_REFERENCE_MATCH',
      suggestedCustomer: null,
    });
    expect(byTrx['CCC11111DD'].reviewReason).toBe('NO_REFERENCE_MATCH');
    expect(await ctx.db.payment.count()).toBe(0);
  });

  it('does not credit a terminated customer automatically', async () => {
    const c = await addCustomer('Gone', '01711000009', 'G1');
    await ctx.db.customer.update({ where: { id: c.id }, data: { status: 'TERMINATED' } });
    const admin = await loginAs(ctx.app, ADMIN);
    const res = await upload(admin, statement(line('AAA11111BB', 'G1', 500)));
    expect(res.body.data).toMatchObject({ posted: 0, needsReview: 1 });
  });

  it('verifies a manually entered bKash payment instead of paying twice, and flags amount mismatches', async () => {
    const c = await addCustomer('Karim Mia', '01711223344', 'K1');
    const admin = await loginAs(ctx.app, ADMIN);
    const manual = (id: string, trx: string, amountPoisha: number) =>
      admin
        .post('/api/v1/payments')
        .send({ customerId: id, amountPoisha, method: 'BKASH', bkashTrxId: trx });
    await manual(c.id, 'AAA11111BB', 50000);
    await manual(c.id, 'BBB11111CC', 30000);

    const res = await upload(
      admin,
      statement(line('AAA11111BB', 'K1', 500), line('BBB11111CC', 'K1', 400)),
    );
    expect(res.body.data).toMatchObject({ verified: 1, needsReview: 1, posted: 0 });
    expect(await ctx.db.payment.count()).toBe(2);

    const mismatch = (await admin.get('/api/v1/bkash/transactions?status=NEEDS_REVIEW')).body
      .data[0];
    expect(mismatch.reviewReason).toBe('AMOUNT_MISMATCH');
    // Assigning would pay twice: refused. Admin can only ignore it after checking.
    expect(
      (
        await admin
          .post(`/api/v1/bkash/transactions/${mismatch.id}/assign`)
          .send({ customerId: c.id })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin
          .post(`/api/v1/bkash/transactions/${mismatch.id}/ignore`)
          .send({ reason: 'Checked, 300 was right' })
      ).status,
    ).toBe(200);
  });

  it('reports bad files clearly and keeps good rows when only some rows are bad', async () => {
    const admin = await loginAs(ctx.app, ADMIN);
    const bad = await upload(admin, 'Foo,Bar\n1,2');
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.error.details)).toContain('Missing column');

    await addCustomer('Karim Mia', '01711223344', 'K1');
    const mixed = await upload(
      admin,
      statement(
        line('AAA11111BB', 'K1', 500),
        line('X', 'K1', 500),
        `CCC11111DD,13/11/2026 10:30:00,01999000111,K1,500,Failed`,
      ),
    );
    expect(mixed.body.data).toMatchObject({ totalRows: 3, posted: 1, invalid: 2 });
    expect(mixed.body.data.problems).toHaveLength(2);
  });

  it('accepts a realistic month of rows (larger than the normal request limit)', async () => {
    await addCustomer('Karim Mia', '01711223344', 'K1');
    const admin = await loginAs(ctx.app, ADMIN);
    const rows = Array.from({ length: 2500 }, (_, i) =>
      line(`TRX${String(i).padStart(7, '0')}`, `unknown ${i}`, 500, '01555000000'),
    );
    const csv = statement(...rows);
    expect(csv.length).toBeGreaterThan(150_000);
    let offset: number | null = 0;
    let slices = 0;
    let review = 0;
    while (offset !== null) {
      const res = await upload(admin, csv, offset);
      expect(res.status).toBe(200);
      expect(res.body.data.totalRows).toBe(2500);
      review += res.body.data.needsReview;
      offset = res.body.data.nextOffset;
      slices += 1;
    }
    expect(slices).toBe(25); // 2,500 rows / 100 per slice
    expect(review).toBe(2500);
    // Sending the whole file again is harmless: every row is a duplicate.
    const again = await upload(admin, csv, 0);
    expect(again.body.data).toMatchObject({ duplicates: 100, needsReview: 0 });
  });
});

describe('review queue actions', () => {
  async function queued(ref = 'unknown') {
    const admin = await loginAs(ctx.app, ADMIN);
    await upload(admin, statement(line('AAA11111BB', ref, 500)));
    const row = (await admin.get('/api/v1/bkash/transactions?status=NEEDS_REVIEW')).body.data[0];
    return { admin, row };
  }

  it('assign credits the chosen customer, links the receipt, and cannot be repeated', async () => {
    const c = await addCustomer('Karim Mia', '01711223344');
    await ctx.billing.generateForPeriod();
    const { admin, row } = await queued();

    const res = await admin
      .post(`/api/v1/bkash/transactions/${row.id}/assign`)
      .send({ customerId: c.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ASSIGNED',
      customer: { id: c.id },
      receiptNumber: 'R000001',
    });
    expect((await admin.get(`/api/v1/customers/${c.id}/billing`)).body.data.outstandingPoisha).toBe(
      0,
    );
    expect(
      (await admin.post(`/api/v1/bkash/transactions/${row.id}/assign`).send({ customerId: c.id }))
        .status,
    ).toBe(409);
    expect(
      (await admin.post(`/api/v1/bkash/transactions/${row.id}/ignore`).send({ reason: 'too late' }))
        .status,
    ).toBe(409);
  });

  it('assign to an unknown customer fails without changing the row', async () => {
    const { admin, row } = await queued();
    const res = await admin
      .post(`/api/v1/bkash/transactions/${row.id}/assign`)
      .send({ customerId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect(
      (await admin.get('/api/v1/bkash/transactions?status=NEEDS_REVIEW')).body.data,
    ).toHaveLength(1);
  });

  it('ignore needs a reason and removes the row from the queue', async () => {
    const { admin, row } = await queued();
    expect(
      (await admin.post(`/api/v1/bkash/transactions/${row.id}/ignore`).send({ reason: '' })).status,
    ).toBe(400);
    const res = await admin
      .post(`/api/v1/bkash/transactions/${row.id}/ignore`)
      .send({ reason: 'Not a customer payment' });
    expect(res.body.data).toMatchObject({
      status: 'IGNORED',
      ignoreReason: 'Not a customer payment',
    });
    expect(
      (await admin.get('/api/v1/bkash/transactions?status=NEEDS_REVIEW')).body.meta.needsReview,
    ).toBe(0);
  });

  it('is admin-only and fully audited', async () => {
    const staff = await loginAs(ctx.app, STAFF);
    expect((await upload(staff, statement(line('AAA11111BB', 'x', 500)))).status).toBe(403);
    expect((await staff.get('/api/v1/bkash/transactions')).status).toBe(403);

    const { admin, row } = await queued();
    await admin
      .post(`/api/v1/bkash/transactions/${row.id}/ignore`)
      .send({ reason: 'Not a customer payment' });
    const actions = (await ctx.db.auditLog.findMany()).map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['BKASH_STATEMENT_IMPORTED', 'BKASH_TRANSACTION_IGNORED']),
    );
  });
});
