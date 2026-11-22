import type { ListDuesQuery } from '@isp/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

export interface DueRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  area: string | null;
  customerStatus: string;
  outstandingPoisha: bigint;
  openInvoices: number;
  oldestDueDate: Date;
}

export interface PaymentRow {
  receiptNumber: string;
  receivedAt: Date;
  customerCode: string;
  customerName: string;
  method: string;
  bkashTrxId: string | null;
  amountPoisha: bigint;
  status: string;
}

const UNPAID = Prisma.sql`i.status IN ('ISSUED', 'PARTIALLY_PAID')`;

/** Read-only aggregates. Raw SQL keeps each report to a single round trip. */
export class ReportsRepository {
  constructor(private readonly db: Database) {}

  customersByStatus() {
    return this.db.customer.groupBy({ by: ['status'], _count: { _all: true } });
  }

  async invoiced(period: Date): Promise<{ total: bigint; count: number }> {
    const r = await this.db.invoice.aggregate({
      where: { period, status: { not: 'VOID' } },
      _sum: { amountPoisha: true },
      _count: { _all: true },
    });
    return { total: r._sum.amountPoisha ?? 0n, count: r._count._all };
  }

  async collectedByMethod(from: Date, to: Date): Promise<Record<string, bigint>> {
    const rows = await this.db.payment.groupBy({
      by: ['method'],
      where: { status: 'POSTED', receivedAt: { gte: from, lt: to } },
      _sum: { amountPoisha: true },
    });
    return Object.fromEntries(rows.map((r) => [r.method, r._sum.amountPoisha ?? 0n]));
  }

  async dailyCollections(
    from: Date,
    to: Date,
  ): Promise<Array<{ date: string; method: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT to_char((received_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS date,
             method::text AS method, SUM(amount_poisha) AS total
      FROM payments
      WHERE status = 'POSTED' AND received_at >= ${from} AND received_at < ${to}
      GROUP BY 1, 2 ORDER BY 1`;
  }

  async outstanding(today: Date): Promise<{
    outstanding: bigint;
    overdue: bigint;
    overdueCustomers: number;
  }> {
    const [row] = await this.db.$queryRaw<
      Array<{ outstanding: bigint | null; overdue: bigint | null; overdue_customers: bigint }>
    >`
      SELECT SUM(i.amount_poisha - i.paid_poisha) AS outstanding,
             SUM(i.amount_poisha - i.paid_poisha) FILTER (WHERE i.due_date < ${today}::date) AS overdue,
             COUNT(DISTINCT i.customer_id) FILTER (WHERE i.due_date < ${today}::date) AS overdue_customers
      FROM invoices i WHERE ${UNPAID}`;
    return {
      outstanding: row?.outstanding ?? 0n,
      overdue: row?.overdue ?? 0n,
      overdueCustomers: Number(row?.overdue_customers ?? 0n),
    };
  }

  async totalCustomerCredit(): Promise<bigint> {
    const r = await this.db.customer.aggregate({ _sum: { creditPoisha: true } });
    return r._sum.creditPoisha ?? 0n;
  }

  bkashNeedsReview(): Promise<number> {
    return this.db.bkashTransaction.count({ where: { status: 'NEEDS_REVIEW' } });
  }

  failedRouterJobs(): Promise<number> {
    return this.db.networkJob.count({ where: { status: 'FAILED' } });
  }

  private duesFilter(today: Date, query: Pick<ListDuesQuery, 'search' | 'overdueOnly'>) {
    const search = query.search
      ? Prisma.sql`AND (c.full_name ILIKE ${`%${query.search}%`} OR c.customer_code ILIKE ${`%${query.search}%`} OR c.phone LIKE ${`%${query.search}%`})`
      : Prisma.empty;
    const overdue = query.overdueOnly ? Prisma.sql`AND i.due_date < ${today}::date` : Prisma.empty;
    return Prisma.sql`WHERE ${UNPAID} ${search} ${overdue}`;
  }

  /** One row per customer with unpaid bills, oldest debt first. `limit` null = everything (CSV). */
  async dues(
    today: Date,
    query: Pick<ListDuesQuery, 'search' | 'overdueOnly'>,
    page: { skip: number; take: number } | null,
  ): Promise<{ rows: DueRow[]; total: number }> {
    const where = this.duesFilter(today, query);
    const paging = page ? Prisma.sql`LIMIT ${page.take} OFFSET ${page.skip}` : Prisma.empty;
    const [rows, count] = await Promise.all([
      this.db.$queryRaw<
        Array<{
          customer_id: string;
          customer_code: string;
          full_name: string;
          phone: string;
          area: string | null;
          status: string;
          outstanding: bigint;
          open_invoices: bigint;
          oldest_due: Date;
        }>
      >`
        SELECT c.id AS customer_id, c.customer_code, c.full_name, c.phone, c.area, c.status::text AS status,
               SUM(i.amount_poisha - i.paid_poisha) AS outstanding,
               COUNT(*) AS open_invoices, MIN(i.due_date) AS oldest_due
        FROM invoices i JOIN customers c ON c.id = i.customer_id
        ${where}
        GROUP BY c.id
        ORDER BY MIN(i.due_date) ASC, SUM(i.amount_poisha - i.paid_poisha) DESC, c.customer_code ASC
        ${paging}`,
      this.db.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(DISTINCT c.id) AS total
        FROM invoices i JOIN customers c ON c.id = i.customer_id ${where}`,
    ]);
    return {
      total: Number(count[0]?.total ?? 0n),
      rows: rows.map((r) => ({
        customerId: r.customer_id,
        customerCode: r.customer_code,
        customerName: r.full_name,
        phone: r.phone,
        area: r.area,
        customerStatus: r.status,
        outstandingPoisha: r.outstanding,
        openInvoices: Number(r.open_invoices),
        oldestDueDate: r.oldest_due,
      })),
    };
  }

  async paymentsBetween(from: Date, to: Date): Promise<PaymentRow[]> {
    const rows = await this.db.payment.findMany({
      where: { receivedAt: { gte: from, lt: to } },
      include: { customer: { select: { customerCode: true, fullName: true } } },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map((p) => ({
      receiptNumber: p.receiptNumber,
      receivedAt: p.receivedAt,
      customerCode: p.customer.customerCode,
      customerName: p.customer.fullName,
      method: p.method,
      bkashTrxId: p.bkashTrxId,
      amountPoisha: p.amountPoisha,
      status: p.status,
    }));
  }

  // ---- finance (Phase 12) ----
  /** Month text like 2026-10, in Asia/Dhaka. */
  private static readonly DHAKA_MONTH = (column: string) =>
    Prisma.raw(`to_char((${column} AT TIME ZONE 'Asia/Dhaka'), 'YYYY-MM')`);

  async collectedByMonth(from: Date, to: Date): Promise<Array<{ period: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT ${ReportsRepository.DHAKA_MONTH('received_at')} AS period, SUM(amount_poisha) AS total
      FROM payments WHERE status = 'POSTED' AND received_at >= ${from} AND received_at < ${to}
      GROUP BY 1`;
  }

  async invoicedByMonth(from: Date, to: Date): Promise<Array<{ period: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT to_char(period, 'YYYY-MM') AS period, SUM(amount_poisha) AS total
      FROM invoices WHERE status <> 'VOID' AND period >= ${from}::date AND period < ${to}::date
      GROUP BY 1`;
  }

  async expensesByMonth(from: Date, to: Date): Promise<Array<{ period: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT to_char(spent_on, 'YYYY-MM') AS period, SUM(amount_poisha) AS total
      FROM expenses WHERE spent_on >= ${from}::date AND spent_on < ${to}::date GROUP BY 1`;
  }

  async expensesByCategory(
    from: Date,
    to: Date,
  ): Promise<Array<{ category: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT category, SUM(amount_poisha) AS total FROM expenses
      WHERE spent_on >= ${from}::date AND spent_on < ${to}::date
      GROUP BY category ORDER BY SUM(amount_poisha) DESC`;
  }

  async collectors(
    from: Date,
    to: Date,
  ): Promise<
    Array<{ userId: string; name: string; payments: bigint; cash: bigint; bkash: bigint }>
  > {
    return this.db.$queryRaw`
      SELECT u.id AS "userId", u.full_name AS name, COUNT(*) AS payments,
             COALESCE(SUM(p.amount_poisha) FILTER (WHERE p.method = 'CASH'), 0) AS cash,
             COALESCE(SUM(p.amount_poisha) FILTER (WHERE p.method = 'BKASH'), 0) AS bkash
      FROM payments p JOIN users u ON u.id = p.received_by
      WHERE p.status = 'POSTED' AND p.received_at >= ${from} AND p.received_at < ${to}
      GROUP BY u.id, u.full_name ORDER BY SUM(p.amount_poisha) DESC`;
  }

  /** Per month: billed, still unpaid, and money received (Dhaka months), oldest first. */
  async trend(
    firstPeriod: Date,
    from: Date,
  ): Promise<Array<{ period: string; billed: bigint; unpaid: bigint; collected: bigint }>> {
    return this.db.$queryRaw`
      WITH b AS (
        SELECT to_char(i.period, 'YYYY-MM') AS period, SUM(i.amount_poisha) AS billed,
               SUM(i.amount_poisha - i.paid_poisha) FILTER (WHERE ${UNPAID}) AS unpaid
        FROM invoices i WHERE i.period >= ${firstPeriod}::date GROUP BY 1),
      c AS (
        SELECT to_char(p.received_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS period,
               SUM(p.amount_poisha) AS collected
        FROM payments p WHERE p.status = 'POSTED' AND p.received_at >= ${from} GROUP BY 1)
      SELECT COALESCE(b.period, c.period) AS period, COALESCE(b.billed, 0) AS billed,
             COALESCE(b.unpaid, 0) AS unpaid, COALESCE(c.collected, 0) AS collected
      FROM b FULL JOIN c ON c.period = b.period
      ORDER BY 1`;
  }

  async areas(
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      area: string | null;
      customers: bigint;
      active: bigint;
      outstanding: bigint;
      collected: bigint;
    }>
  > {
    return this.db.$queryRaw`
      SELECT NULLIF(btrim(c.area), '') AS area,
             COUNT(*) FILTER (WHERE c.status <> 'TERMINATED') AS customers,
             COUNT(*) FILTER (WHERE c.status = 'ACTIVE') AS active,
             COALESCE(SUM(o.owed), 0) AS outstanding,
             COALESCE(SUM(pay.paid), 0) AS collected
      FROM customers c
      LEFT JOIN (SELECT customer_id, SUM(amount_poisha - paid_poisha) AS owed
                 FROM invoices WHERE status IN ('ISSUED', 'PARTIALLY_PAID') GROUP BY customer_id) o
             ON o.customer_id = c.id
      LEFT JOIN (SELECT customer_id, SUM(amount_poisha) AS paid FROM payments
                 WHERE status = 'POSTED' AND received_at >= ${from} AND received_at < ${to}
                 GROUP BY customer_id) pay ON pay.customer_id = c.id
      GROUP BY 1 ORDER BY customers DESC, area`;
  }

  async newCustomersByMonth(
    from: Date,
    to: Date,
  ): Promise<Array<{ period: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT ${ReportsRepository.DHAKA_MONTH('created_at')} AS period, COUNT(*) AS total
      FROM customers WHERE created_at >= ${from} AND created_at < ${to} GROUP BY 1`;
  }

  async lostCustomersByMonth(
    from: Date,
    to: Date,
  ): Promise<Array<{ period: string; total: bigint }>> {
    return this.db.$queryRaw`
      SELECT ${ReportsRepository.DHAKA_MONTH('terminated_at')} AS period, COUNT(*) AS total
      FROM customers WHERE status = 'TERMINATED' AND terminated_at >= ${from} AND terminated_at < ${to}
      GROUP BY 1`;
  }

  async suspendedForNonPayment(): Promise<number> {
    return this.db.customer.count({ where: { status: 'SUSPENDED', suspendReason: 'NON_PAYMENT' } });
  }

  async digestAlreadySent(period: string): Promise<boolean> {
    return (await this.db.reportRun.count({ where: { period } })) > 0;
  }

  async markDigestSent(period: string, at: Date): Promise<void> {
    await this.db.reportRun.upsert({
      where: { period },
      create: { period, sentAt: at },
      update: {},
    });
  }
}
