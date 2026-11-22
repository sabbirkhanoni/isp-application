import type { InvoiceStatus } from '@isp/contracts';

/** Status of a non-void invoice from how much of it has been paid (all values in poisha). */
export function invoiceStatusFor(amountPoisha: bigint, paidPoisha: bigint): InvoiceStatus {
  if (paidPoisha >= amountPoisha) return 'PAID';
  return paidPoisha > 0n ? 'PARTIALLY_PAID' : 'ISSUED';
}

/** Due date: the 10th of the billing month, but never sooner than 3 days after issue. */
export const DUE_DAY_OF_MONTH = 10;
export const MIN_DAYS_TO_PAY = 3;

export function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export type InvoiceLineKind = 'PACKAGE' | 'DISCOUNT' | 'ONE_TIME' | 'PRORATION';

export interface LineDraft {
  kind: InvoiceLineKind;
  description: string;
  /** Signed: discounts are negative. */
  amountPoisha: bigint;
}

export interface PendingCharge {
  id: string;
  description: string;
  amountPoisha: bigint;
}

/** Number of days in the calendar month that starts on `periodStart` (a UTC date-only value). */
export function daysInMonth(periodStart: Date): number {
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/** `amount` for `days` of a month with `total` days, rounded down to a whole poisha. */
export function prorate(amount: bigint, days: number, total: number): bigint {
  return (amount * BigInt(days)) / BigInt(total);
}

export interface BuildLinesInput {
  packageName: string;
  price: bigint;
  /** Standing monthly discount (>= 0). */
  discount: bigint;
  discountNote: string | null;
  /** Billing month start; used with `joinedOn` for proration. */
  periodStart: Date;
  /** Day the customer joined, only when proration applies to them. */
  joinedOn: Date | null;
  prorateNewCustomers: boolean;
  charges: PendingCharge[];
}

export interface BuiltInvoice {
  lines: LineDraft[];
  total: bigint;
  /** Charges used on this invoice with the amount actually used (discounts may be trimmed). */
  billed: Array<{ id: string; amountPoisha: bigint }>;
  /** Unused part of a one-time discount that did not fit; it waits for the next invoice. */
  carryForward: Array<{ description: string; amountPoisha: bigint }>;
}

/**
 * Turns a customer's price, standing discount, joining day and waiting one-time charges into invoice lines.
 * The total never goes below zero: a discount larger than what is owed is trimmed and the rest carried forward.
 */
export function buildInvoiceLines(input: BuildLinesInput): BuiltInvoice {
  const total = daysInMonth(input.periodStart);
  const joinsThisMonth =
    input.prorateNewCustomers &&
    input.joinedOn !== null &&
    input.joinedOn.getUTCFullYear() === input.periodStart.getUTCFullYear() &&
    input.joinedOn.getUTCMonth() === input.periodStart.getUTCMonth() &&
    input.joinedOn.getUTCDate() > 1;
  const daysUsed = joinsThisMonth ? total - (input.joinedOn?.getUTCDate() ?? 1) + 1 : total;

  const lines: LineDraft[] = [];
  const packageAmount = joinsThisMonth ? prorate(input.price, daysUsed, total) : input.price;
  lines.push({
    kind: joinsThisMonth ? 'PRORATION' : 'PACKAGE',
    description: joinsThisMonth
      ? `${input.packageName} (${daysUsed}/${total} days)`
      : input.packageName,
    amountPoisha: packageAmount,
  });
  let running = packageAmount;

  const discount = joinsThisMonth ? prorate(input.discount, daysUsed, total) : input.discount;
  const discountApplied = min(discount, running);
  if (discountApplied > 0n) {
    lines.push({
      kind: 'DISCOUNT',
      description: input.discountNote ?? '',
      amountPoisha: -discountApplied,
    });
    running -= discountApplied;
  }

  const billed: BuiltInvoice['billed'] = [];
  const carryForward: BuiltInvoice['carryForward'] = [];
  for (const charge of input.charges) {
    if (charge.amountPoisha > 0n) {
      lines.push({
        kind: 'ONE_TIME',
        description: charge.description,
        amountPoisha: charge.amountPoisha,
      });
      billed.push({ id: charge.id, amountPoisha: charge.amountPoisha });
      running += charge.amountPoisha;
      continue;
    }
    const wanted = -charge.amountPoisha;
    const used = min(wanted, running);
    if (used > 0n) {
      lines.push({ kind: 'ONE_TIME', description: charge.description, amountPoisha: -used });
      billed.push({ id: charge.id, amountPoisha: -used });
      running -= used;
    }
    if (used < wanted) {
      carryForward.push({ description: charge.description, amountPoisha: -(wanted - used) });
      if (used === 0n) billed.push({ id: charge.id, amountPoisha: 0n });
    }
  }
  return { lines, total: running, billed, carryForward };
}
