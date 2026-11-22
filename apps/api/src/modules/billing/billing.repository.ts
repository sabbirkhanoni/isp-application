import type { ListInvoicesQuery } from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import { activateIfFirstPaymentDone, lockCustomer } from '../customers/customer-activation.js';
import {
  DUE_DAY_OF_MONTH,
  MIN_DAYS_TO_PAY,
  buildInvoiceLines,
  invoiceStatusFor,
  min,
} from './invoice-math.js';
import type { BillingSettings } from '@isp/contracts';
import { addDays, dateOnly } from '../../shared/utils/dhaka-time.js';
import type { InvoiceWithCustomer } from './billing.mapper.js';

const WITH_CUSTOMER = { customer: { select: { customerCode: true, fullName: true } } } as const;

export type BillableCustomer = Awaited<
  ReturnType<BillingRepository['findCustomersMissingInvoice']>
>[number];

export interface IssueResult {
  created: boolean;
  activated: boolean;
}

export class BillingRepository {
  constructor(private readonly db: Database) {}

  async list(query: ListInvoicesQuery, periodStart: Date | undefined) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(periodStart ? { period: periodStart } : {}),
      ...(query.unpaidOnly ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } : {}),
      ...(query.search
        ? {
            customer: {
              OR: [
                { customerCode: { contains: query.search, mode: 'insensitive' } },
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.invoice.findMany({
        where,
        include: WITH_CUSTOMER,
        orderBy: [{ period: 'desc' }, { invoiceNumber: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.invoice.count({ where }),
    ]);
    return { items: items as InvoiceWithCustomer[], total };
  }

  listByCustomer(customerId: string): Promise<InvoiceWithCustomer[]> {
    return this.db.invoice.findMany({
      where: { customerId },
      include: WITH_CUSTOMER,
      orderBy: { period: 'desc' },
      take: 36,
    });
  }

  /** Standing discount, package price and the latest one-time charges of a customer. */
  async customerExtras(customerId: string) {
    const [subscription, charges] = await Promise.all([
      this.db.subscription.findUnique({
        where: { customerId },
        select: {
          monthlyDiscountPoisha: true,
          discountNote: true,
          package: { select: { monthlyPricePoisha: true } },
        },
      }),
      this.db.charge.findMany({
        where: { customerId, status: { not: 'CANCELLED' } },
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { subscription, charges };
  }

  findDetail(id: string) {
    return this.db.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { customerCode: true, fullName: true, phone: true, address: true } },
        lines: { orderBy: { createdAt: 'asc' } },
        allocations: { include: { payment: true }, orderBy: { payment: { receivedAt: 'asc' } } },
      },
    });
  }

  async customerBalance(
    customerId: string,
  ): Promise<{ creditPoisha: bigint; outstandingPoisha: bigint } | null> {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId },
      select: { creditPoisha: true },
    });
    if (!customer) return null;
    const rows = await this.db.$queryRaw<Array<{ due: bigint | null }>>`
      SELECT COALESCE(SUM(amount_poisha - paid_poisha), 0)::bigint AS due
      FROM invoices WHERE customer_id = ${customerId}::uuid AND status IN ('ISSUED', 'PARTIALLY_PAID')`;
    return { creditPoisha: customer.creditPoisha, outstandingPoisha: rows[0]?.due ?? 0n };
  }

  /** Billable customers (not terminated, with a subscription) that have no invoice for the period yet. */
  findCustomersMissingInvoice(periodStart: Date) {
    return this.db.customer.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING_ACTIVATION', 'SUSPENDED'] },
        subscription: { isNot: null },
        invoices: { none: { period: periodStart } },
      },
      select: {
        id: true,
        customerCode: true,
        joinedOn: true,
        isFree: true,
        subscription: {
          select: {
            monthlyDiscountPoisha: true,
            discountNote: true,
            package: { select: { name: true, monthlyPricePoisha: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Issues one invoice (price, standing discount, proration, waiting one-time charges) and applies any
   * customer credit to it, atomically. A unique-violation (another run issued it first) is reported by
   * the caller as "not created".
   */
  issueInvoice(
    customer: BillableCustomer,
    settings: BillingSettings,
    periodStart: Date,
    today: Date,
    now: Date,
  ): Promise<IssueResult> {
    return this.db.$transaction(async (tx) => {
      const credit = (await lockCustomer(tx, customer.id)) ?? 0n;
      const charges = await tx.charge.findMany({
        where: { customerId: customer.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      const sub = customer.subscription;
      if (!sub) return { created: false, activated: false };
      const built = buildInvoiceLines({
        packageName: sub.package.name,
        // Free / VIP lines get a 0 bill every month so the records stay complete.
        price: customer.isFree ? 0n : sub.package.monthlyPricePoisha,
        discount: customer.isFree ? 0n : sub.monthlyDiscountPoisha,
        discountNote: customer.isFree ? null : sub.discountNote,
        periodStart,
        joinedOn: customer.joinedOn,
        prorateNewCustomers: settings.prorateNewCustomers,
        charges: charges.map((c) => ({
          id: c.id,
          description: c.description,
          amountPoisha: c.amountPoisha,
        })),
      });
      const amountPoisha = built.total;
      const applied = min(credit, amountPoisha);
      const tenth = dateOnly(
        periodStart.getUTCFullYear(),
        periodStart.getUTCMonth() + 1,
        DUE_DAY_OF_MONTH,
      );
      const earliest = addDays(today, MIN_DAYS_TO_PAY);
      const dueDate = tenth.getTime() >= earliest.getTime() ? tenth : earliest;
      const period = `${periodStart.getUTCFullYear()}${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${period}-${customer.customerCode}`,
          customerId: customer.id,
          period: periodStart,
          amountPoisha,
          paidPoisha: applied,
          creditAppliedPoisha: applied,
          dueDate,
          status: invoiceStatusFor(amountPoisha, applied),
          issuedAt: now,
          lines: { create: built.lines },
        },
      });
      for (const used of built.billed) {
        await tx.charge.update({
          where: { id: used.id },
          data:
            used.amountPoisha === 0n
              ? {}
              : { status: 'BILLED', invoiceId: invoice.id, amountPoisha: used.amountPoisha },
        });
      }
      for (const rest of built.carryForward) {
        const origin = charges.find((c) => c.description === rest.description) ?? charges[0];
        if (!origin) continue; // cannot happen: a carry-forward always comes from a charge
        await tx.charge.create({
          data: {
            customerId: customer.id,
            description: rest.description,
            amountPoisha: rest.amountPoisha,
            createdBy: origin.createdBy,
          },
        });
      }
      if (applied > 0n) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditPoisha: { decrement: applied } },
        });
      }
      const activated =
        applied >= amountPoisha ? await activateIfFirstPaymentDone(tx, customer.id) : false;
      return { created: true, activated };
    });
  }
}
