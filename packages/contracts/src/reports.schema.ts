import { z } from 'zod';
import { emptyToUndefined, paginationQuerySchema } from './common.schema.js';
import { periodSchema } from './billing.schema.js';

export const reportPeriodQuerySchema = z.object({
  /** Dhaka calendar month; defaults to the current month. */
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
});
export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;

export const listDuesQuerySchema = paginationQuerySchema.extend({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  /** Only customers with a bill past its due date. */
  overdueOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});
export type ListDuesQuery = z.infer<typeof listDuesQuerySchema>;

export interface DailyCollectionDto {
  /** YYYY-MM-DD, Asia/Dhaka. */
  date: string;
  cashPoisha: number;
  bkashPoisha: number;
}

export interface ReportSummaryDto {
  period: string;
  customers: { active: number; pendingActivation: number; suspended: number; terminated: number };
  billing: {
    invoicedPoisha: number;
    invoiceCount: number;
    collectedPoisha: number;
    collectedCashPoisha: number;
    collectedBkashPoisha: number;
    /** Everything unpaid, any month. */
    outstandingPoisha: number;
    /** Unpaid and past the due date, any month. */
    overduePoisha: number;
    overdueCustomers: number;
    /** Prepaid balances held for customers. */
    customerCreditPoisha: number;
  };
  attention: { bkashNeedsReview: number; failedRouterJobs: number };
  daily: DailyCollectionDto[];
}

export interface DueRowDto {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  area: string | null;
  customerStatus: string;
  outstandingPoisha: number;
  openInvoices: number;
  /** Oldest unpaid due date, YYYY-MM-DD. */
  oldestDueDate: string;
  daysOverdue: number;
}

// ---- finance reports (Phase 12) ----
export const profitQuerySchema = z.object({
  /** Month shown in the category breakdown; defaults to the current month. */
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
  /** How many months to list, ending at `period`. */
  months: z.coerce.number().int().min(1).max(24).default(12),
});
export type ProfitQuery = z.infer<typeof profitQuerySchema>;

export interface ProfitMonthDto {
  period: string;
  invoicedPoisha: number;
  collectedPoisha: number;
  expensesPoisha: number;
  /** Collected minus expenses (cash basis: money actually received). */
  profitPoisha: number;
}

export interface ProfitReportDto {
  period: string;
  months: ProfitMonthDto[];
  categories: Array<{ category: string; totalPoisha: number }>;
}

export interface CollectorRowDto {
  userId: string;
  name: string;
  payments: number;
  cashPoisha: number;
  bkashPoisha: number;
  totalPoisha: number;
}

export interface AreaRowDto {
  /** null = customers with no area filled in. */
  area: string | null;
  customers: number;
  activeCustomers: number;
  outstandingPoisha: number;
  collectedPoisha: number;
}

export interface ChurnMonthDto {
  period: string;
  newCustomers: number;
  lostCustomers: number;
}

export interface ChurnReportDto {
  months: ChurnMonthDto[];
  now: { active: number; suspended: number; suspendedNonPayment: number; terminated: number };
}

export const trendQuerySchema = z.object({
  months: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2).max(24).default(12)),
});
