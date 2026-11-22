import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, createTestContext, loginAs, resetDatabase, seedUsers } from '../helpers.js';

/**
 * Opt-in volume check: PERF=1 npx vitest run test/perf
 * Loads 2,500 customers with a year of bills and prints how long the busy screens and jobs take.
 * Timings use a local database (no network delay) — compare with the budgets, not with production.
 */
const ctx = createTestContext();
const CUSTOMERS = 2500;
const log = (label: string, ms: number) =>
  process.stdout.write(`  ${label}: ${Math.round(ms)} ms\n`);
const timed = async <T>(label: string, fn: () => Promise<T>, budgetMs: number): Promise<T> => {
  const start = performance.now();
  const value = await fn();
  const elapsed = performance.now() - start;
  log(label, elapsed);
  expect(elapsed, `${label} should finish within ${budgetMs} ms`).toBeLessThan(budgetMs);
  return value;
};

describe.skipIf(!process.env['PERF'])('volume: 2,500 customers, 12 months', () => {
  let admin: Awaited<ReturnType<typeof loginAs>>;

  beforeAll(async () => {
    await resetDatabase(ctx.db);
    const users = await seedUsers(ctx.db);
    void users;
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    });
    admin = await loginAs(ctx.app, ADMIN);
    const lines = [
      'customer_id,name,phone,address,area,package,connection_type,pppoe_username,router,status',
    ];
    for (let i = 1; i <= CUSTOMERS; i += 1) {
      lines.push(
        `C${String(i).padStart(5, '0')},Customer ${i},017${String(10_000_000 + i)},House ${i} Road ${i % 30},Area ${i % 25},Home 10,PPPOE,user${i},,`,
      );
    }
    const res = await admin
      .post('/api/v1/customers/import')
      .send({ csv: lines.join('\n'), commit: true });
    expect(res.body.data.created).toBe(CUSTOMERS);

    // A year of history: bills through the real engine, payments inserted in bulk.
    const adminRow = await ctx.db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    for (let month = 0; month < 11; month += 1) {
      const first = new Date(Date.UTC(2025, 11 + month, 1, 4));
      ctx.clock.set(first.toISOString());
      await ctx.billing.generateForPeriod();
      await ctx.db.$executeRawUnsafe(
        `INSERT INTO payments (receipt_number, customer_id, amount_poisha, method, status, received_by, received_at)
         SELECT 'H-' || i.id, i.customer_id, i.amount_poisha, 'CASH', 'POSTED', '${adminRow.id}', i.due_date::timestamptz
         FROM invoices i WHERE i.status = 'ISSUED' AND i.period = '${first.toISOString().slice(0, 8)}01'::date`,
      );
      await ctx.db.$executeRawUnsafe(
        `UPDATE invoices SET status = 'PAID', paid_poisha = amount_poisha
         WHERE status = 'ISSUED' AND period = '${first.toISOString().slice(0, 8)}01'::date`,
      );
    }
    ctx.clock.set('2026-11-01T04:00:00Z');
    await ctx.billing.generateForPeriod();
    await ctx.db.$executeRawUnsafe(
      `UPDATE invoices SET status = 'PAID', paid_poisha = amount_poisha
       WHERE period = '2026-11-01' AND customer_id IN (SELECT id FROM customers ORDER BY customer_code LIMIT 1500)`,
    );
    ctx.clock.set('2026-11-20T04:00:00Z');
  }, 600_000);

  afterAll(() => ctx.close());

  it('keeps the busy screens fast', async () => {
    await timed('dashboard summary', () => admin.get('/api/v1/reports/summary'), 1500);
    const dues = await timed(
      'dues list (page 1)',
      () => admin.get('/api/v1/reports/dues?limit=25'),
      1000,
    );
    expect(dues.body.meta.pagination.total).toBe(1000);
    await timed('dues CSV (1,000 rows)', () => admin.get('/api/v1/reports/dues.csv'), 3000);
    await timed(
      'collections CSV (month)',
      () => admin.get('/api/v1/reports/collections.csv?period=2026-11'),
      3000,
    );
    await timed(
      'customer search',
      () => admin.get('/api/v1/customers?search=Customer%2012&limit=25'),
      1000,
    );
    await timed(
      'invoice list (unpaid)',
      () => admin.get('/api/v1/invoices?unpaidOnly=true&limit=25'),
      1000,
    );
  });

  it('runs the monthly jobs for everyone within the time a request or tick can wait', async () => {
    ctx.clock.set('2026-12-01T04:00:00Z');
    const created = await timed(
      'generate December bills (2,500)',
      () => ctx.billing.generateForPeriod(),
      60_000,
    );
    expect(created.created).toBe(CUSTOMERS);
    const again = await timed(
      're-run generation (nothing new)',
      () => ctx.billing.generateForPeriod(),
      15_000,
    );
    expect(again.created).toBe(0);
  });

  it('imports a month of bKash rows', async () => {
    ctx.clock.set('2026-12-05T04:00:00Z');
    const rows = ['TrxID,Amount,Sender,Reference,Date'];
    for (let i = 1; i <= 2500; i += 1) {
      const ref = i % 10 < 7 ? `C${String(i).padStart(5, '0')}` : 'unknown';
      rows.push(
        `TX${String(10_000_000 + i)},500,0189${String(1_000_000 + i)},${ref},2026-12-04 10:00:00`,
      );
    }
    const csv = rows.join('\n');
    const first = await timed(
      'bKash import, one slice of 150 rows',
      () => admin.post('/api/v1/bkash/imports').send({ fileName: 'dec.csv', csv, offset: 0 }),
      300_000,
    );
    let posted = first.body.data.posted as number;
    let offset = first.body.data.nextOffset as number | null;
    while (offset !== null) {
      const res = await admin
        .post('/api/v1/bkash/imports')
        .send({ fileName: 'dec.csv', csv, offset });
      posted += res.body.data.posted;
      offset = res.body.data.nextOffset;
    }
    expect(posted).toBe(1750);
  }, 600_000);
});
