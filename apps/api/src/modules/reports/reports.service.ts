import type {
  AreaRowDto,
  ChurnReportDto,
  CollectorRowDto,
  DueRowDto,
  ListDuesQuery,
  PaginationMeta,
  ProfitReportDto,
  ReportSummaryDto,
  TrendMonthDto,
} from '@isp/contracts';
import type { Clock } from '../../shared/utils/clock.js';
import {
  currentPeriod,
  dhakaToday,
  formatDateOnly,
  periodStart,
  startOfDhakaMonthUtc,
} from '../../shared/utils/dhaka-time.js';
import type { SmsSender } from '../notifications/sms-sender.js';
import { toCsv } from './csv.js';
import type { DueRow, ReportsRepository } from './reports.repository.js';

const DAY_MS = 86_400_000;

const toDueDto = (row: DueRow, today: Date): DueRowDto => ({
  customerId: row.customerId,
  customerCode: row.customerCode,
  customerName: row.customerName,
  phone: row.phone,
  area: row.area,
  customerStatus: row.customerStatus,
  outstandingPoisha: Number(row.outstandingPoisha),
  openInvoices: row.openInvoices,
  oldestDueDate: formatDateOnly(row.oldestDueDate),
  daysOverdue: Math.max(0, Math.round((today.getTime() - row.oldestDueDate.getTime()) / DAY_MS)),
});

/** Money in CSVs is plain taka with two decimals so spreadsheets can sum it. */
const taka = (poisha: bigint | number): string => (Number(poisha) / 100).toFixed(2);

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly clock: Clock,
  ) {}

  /** [from, to) of the Dhaka calendar month `period`, as UTC instants. */
  private monthRange(period: string): { from: Date; to: Date } {
    const start = periodStart(period);
    const from = startOfDhakaMonthUtc(start);
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { from, to: startOfDhakaMonthUtc(next) };
  }

  async summary(period = currentPeriod(this.clock.now())): Promise<ReportSummaryDto> {
    const today = dhakaToday(this.clock.now());
    const { from, to } = this.monthRange(period);
    const [byStatus, invoiced, collected, daily, owed, credit, needsReview, failedJobs] =
      await Promise.all([
        this.repo.customersByStatus(),
        this.repo.invoiced(periodStart(period)),
        this.repo.collectedByMethod(from, to),
        this.repo.dailyCollections(from, to),
        this.repo.outstanding(today),
        this.repo.totalCustomerCredit(),
        this.repo.bkashNeedsReview(),
        this.repo.failedRouterJobs(),
      ]);

    const count = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
    const cash = collected['CASH'] ?? 0n;
    const bkash = collected['BKASH'] ?? 0n;

    const days = new Map<string, { cashPoisha: number; bkashPoisha: number }>();
    for (const row of daily) {
      const day = days.get(row.date) ?? { cashPoisha: 0, bkashPoisha: 0 };
      if (row.method === 'CASH') day.cashPoisha += Number(row.total);
      else day.bkashPoisha += Number(row.total);
      days.set(row.date, day);
    }

    return {
      period,
      customers: {
        active: count('ACTIVE'),
        pendingActivation: count('PENDING_ACTIVATION'),
        suspended: count('SUSPENDED'),
        terminated: count('TERMINATED'),
      },
      billing: {
        invoicedPoisha: Number(invoiced.total),
        invoiceCount: invoiced.count,
        collectedPoisha: Number(cash + bkash),
        collectedCashPoisha: Number(cash),
        collectedBkashPoisha: Number(bkash),
        outstandingPoisha: Number(owed.outstanding),
        overduePoisha: Number(owed.overdue),
        overdueCustomers: owed.overdueCustomers,
        customerCreditPoisha: Number(credit),
      },
      attention: { bkashNeedsReview: needsReview, failedRouterJobs: failedJobs },
      daily: [...days.entries()].map(([date, v]) => ({ date, ...v })),
    };
  }

  /** Last `months` months including the current one; months with no activity are shown as zeros. */
  async trend(months: number): Promise<TrendMonthDto[]> {
    const today = dhakaToday(this.clock.now());
    const list = Array.from({ length: months }, (_, i) => {
      const d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1 - i), 1),
      );
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const first = periodStart(list[0] as string);
    const rows = await this.repo.trend(first, startOfDhakaMonthUtc(first));
    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    return list.map((period) => {
      const r = byPeriod.get(period);
      return {
        period,
        billedPoisha: Number(r?.billed ?? 0n),
        collectedPoisha: Number(r?.collected ?? 0n),
        unpaidPoisha: Number(r?.unpaid ?? 0n),
      };
    });
  }

  async dues(query: ListDuesQuery): Promise<{ items: DueRowDto[]; pagination: PaginationMeta }> {
    const today = dhakaToday(this.clock.now());
    const { rows, total } = await this.repo.dues(today, query, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: rows.map((r) => toDueDto(r, today)),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async duesCsv(query: Pick<ListDuesQuery, 'search' | 'overdueOnly'>): Promise<string> {
    const today = dhakaToday(this.clock.now());
    const { rows } = await this.repo.dues(today, query, null);
    return toCsv(
      [
        'Customer ID',
        'Name',
        'Phone',
        'Area',
        'Status',
        'Due (BDT)',
        'Open bills',
        'Oldest due date',
        'Days overdue',
      ],
      rows.map((r) => {
        const dto = toDueDto(r, today);
        return [
          dto.customerCode,
          dto.customerName,
          dto.phone,
          dto.area,
          dto.customerStatus,
          taka(r.outstandingPoisha),
          dto.openInvoices,
          dto.oldestDueDate,
          dto.daysOverdue,
        ];
      }),
    );
  }

  async collectionsCsv(period = currentPeriod(this.clock.now())): Promise<string> {
    const { from, to } = this.monthRange(period);
    const rows = await this.repo.paymentsBetween(from, to);
    return toCsv(
      [
        'Receipt',
        'Date (Dhaka)',
        'Customer ID',
        'Name',
        'Method',
        'bKash TrxID',
        'Amount (BDT)',
        'Status',
      ],
      rows.map((p) => [
        p.receiptNumber,
        new Date(p.receivedAt.getTime() + 6 * 3_600_000)
          .toISOString()
          .slice(0, 16)
          .replace('T', ' '),
        p.customerCode,
        p.customerName,
        p.method,
        p.bkashTrxId,
        taka(p.amountPoisha),
        p.status,
      ]),
    );
  }

  // ---- finance (Phase 12) ----
  /** `count` consecutive periods ending at `last`, oldest first. */
  private periodsEndingAt(last: string, count: number): string[] {
    const [y, m] = last.split('-').map(Number) as [number, number];
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }

  /** [from, to) instants covering the whole list of Dhaka months. */
  private spanRange(periods: string[]): { from: Date; to: Date } {
    return {
      from: this.monthRange(periods[0] as string).from,
      to: this.monthRange(periods[periods.length - 1] as string).to,
    };
  }

  async profit(period = currentPeriod(this.clock.now()), months = 12): Promise<ProfitReportDto> {
    const periods = this.periodsEndingAt(period, months);
    const { from, to } = this.spanRange(periods);
    const dateFrom = periodStart(periods[0] as string);
    const last = periodStart(period);
    const endDate = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
    const [collected, invoiced, expenses, categories] = await Promise.all([
      this.repo.collectedByMonth(from, to),
      this.repo.invoicedByMonth(dateFrom, endDate),
      this.repo.expensesByMonth(dateFrom, endDate),
      this.repo.expensesByCategory(periodStart(period), endDate),
    ]);
    const pick = (rows: Array<{ period: string; total: bigint }>, p: string) =>
      Number(rows.find((r) => r.period === p)?.total ?? 0n);
    return {
      period,
      months: periods.map((p) => {
        const c = pick(collected, p);
        const e = pick(expenses, p);
        return {
          period: p,
          invoicedPoisha: pick(invoiced, p),
          collectedPoisha: c,
          expensesPoisha: e,
          profitPoisha: c - e,
        };
      }),
      categories: categories.map((r) => ({ category: r.category, totalPoisha: Number(r.total) })),
    };
  }

  async profitCsv(period?: string, months = 12): Promise<string> {
    const report = await this.profit(period, months);
    return toCsv(
      ['Month', 'Billed (BDT)', 'Collected (BDT)', 'Expenses (BDT)', 'Profit (BDT)'],
      report.months.map((m) => [
        m.period,
        taka(m.invoicedPoisha),
        taka(m.collectedPoisha),
        taka(m.expensesPoisha),
        taka(m.profitPoisha),
      ]),
    );
  }

  async collectors(period = currentPeriod(this.clock.now())): Promise<CollectorRowDto[]> {
    const { from, to } = this.monthRange(period);
    const rows = await this.repo.collectors(from, to);
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      payments: Number(r.payments),
      cashPoisha: Number(r.cash),
      bkashPoisha: Number(r.bkash),
      totalPoisha: Number(r.cash) + Number(r.bkash),
    }));
  }

  async collectorsCsv(period?: string): Promise<string> {
    const rows = await this.collectors(period);
    return toCsv(
      ['Staff', 'Payments', 'Cash (BDT)', 'bKash (BDT)', 'Total (BDT)'],
      rows.map((r) => [
        r.name,
        r.payments,
        taka(r.cashPoisha),
        taka(r.bkashPoisha),
        taka(r.totalPoisha),
      ]),
    );
  }

  async areas(period = currentPeriod(this.clock.now())): Promise<AreaRowDto[]> {
    const { from, to } = this.monthRange(period);
    const rows = await this.repo.areas(from, to);
    return rows.map((r) => ({
      area: r.area,
      customers: Number(r.customers),
      activeCustomers: Number(r.active),
      outstandingPoisha: Number(r.outstanding),
      collectedPoisha: Number(r.collected),
    }));
  }

  async areasCsv(period?: string): Promise<string> {
    const rows = await this.areas(period);
    return toCsv(
      ['Area', 'Customers', 'Active', 'Due (BDT)', 'Collected this month (BDT)'],
      rows.map((r) => [
        r.area ?? '',
        r.customers,
        r.activeCustomers,
        taka(r.outstandingPoisha),
        taka(r.collectedPoisha),
      ]),
    );
  }

  async churn(months = 12): Promise<ChurnReportDto> {
    const periods = this.periodsEndingAt(currentPeriod(this.clock.now()), months);
    const { from, to } = this.spanRange(periods);
    const [fresh, lost, byStatus, nonPayment] = await Promise.all([
      this.repo.newCustomersByMonth(from, to),
      this.repo.lostCustomersByMonth(from, to),
      this.repo.customersByStatus(),
      this.repo.suspendedForNonPayment(),
    ]);
    const pick = (rows: Array<{ period: string; total: bigint }>, p: string) =>
      Number(rows.find((r) => r.period === p)?.total ?? 0n);
    const count = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
    return {
      months: periods.map((p) => ({
        period: p,
        newCustomers: pick(fresh, p),
        lostCustomers: pick(lost, p),
      })),
      now: {
        active: count('ACTIVE'),
        suspended: count('SUSPENDED'),
        suspendedNonPayment: nonPayment,
        terminated: count('TERMINATED'),
      },
    };
  }

  /** The short text the owner gets on the 1st: last month in a few lines. */
  async monthlyDigestText(period: string): Promise<string> {
    const [profit, churn, owed] = await Promise.all([
      this.profit(period, 1),
      this.churn(2),
      this.repo.outstanding(dhakaToday(this.clock.now())),
    ]);
    const m = profit.months[0]!;
    const c = churn.months.find((x) => x.period === period);
    const money = (p: number) => `${Math.round(p / 100).toLocaleString('en-US')}`;
    return [
      `ISP মাসিক রিপোর্ট ${period}`,
      `আদায় ৳${money(m.collectedPoisha)}, খরচ ৳${money(m.expensesPoisha)}, লাভ ৳${money(m.profitPoisha)}`,
      `বিল ৳${money(m.invoicedPoisha)}, মোট বকেয়া ৳${money(Number(owed.outstanding))}`,
      `নতুন গ্রাহক ${c?.newCustomers ?? 0}, ছেড়েছে ${c?.lostCustomers ?? 0}, চালু ${churn.now.active}`,
    ].join('\n');
  }

  /**
   * Sends last month's summary to the owner once (the first time this runs in a new month).
   * Returns the period that was sent, or null when nothing was due.
   */
  async sendMonthlyDigest(sender: SmsSender, ownerPhone: string | null): Promise<string | null> {
    if (!ownerPhone) return null;
    const [year, month] = currentPeriod(this.clock.now()).split('-').map(Number) as [
      number,
      number,
    ];
    const previous = this.periodsEndingAt(
      `${year}-${String(month).padStart(2, '0')}`,
      2,
    )[0] as string;
    if (await this.repo.digestAlreadySent(previous)) return null;
    await sender.send(ownerPhone, await this.monthlyDigestText(previous));
    await this.repo.markDigestSent(previous, this.clock.now());
    return previous;
  }
}
