import type { ListPaymentsQuery, RecordPaymentInput } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import type { DbTransaction } from '../../shared/database/transaction.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { invoiceStatusFor, min } from '../billing/invoice-math.js';
import {
  activateIfFirstPaymentDone,
  lockCustomer,
  reactivateIfCleared,
} from '../customers/customer-activation.js';
import { dhakaToday } from '../../shared/utils/dhaka-time.js';
import { enqueueSms } from '../notifications/notifications.repository.js';
import { paymentReceivedText, takaText } from '../notifications/sms-templates.js';
import type { SmsTemplateStore } from '../notifications/sms-template.store.js';
import type { Language } from '@isp/contracts';
import { PAYMENT_INCLUDE, type PaymentWithRelations } from './payments.mapper.js';

/** Pays the customer's oldest unpaid invoices first (FIFO); whatever is left over is returned as `remaining`. */
async function allocateFifo(tx: DbTransaction, customerId: string, amount: bigint) {
  const open = await tx.invoice.findMany({
    where: { customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    orderBy: { period: 'asc' },
  });
  let remaining = amount;
  const allocations: Array<{ invoiceId: string; amountPoisha: bigint }> = [];
  for (const invoice of open) {
    if (remaining === 0n) break;
    const take = min(remaining, invoice.amountPoisha - invoice.paidPoisha);
    const paid = invoice.paidPoisha + take;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidPoisha: paid, status: invoiceStatusFor(invoice.amountPoisha, paid) },
    });
    allocations.push({ invoiceId: invoice.id, amountPoisha: take });
    remaining -= take;
  }
  return { open, allocations, remaining };
}

/** Gives the money of earlier allocations back to their invoices (the opposite of allocateFifo). */
async function releaseAllocations(
  tx: DbTransaction,
  allocations: Array<{ invoiceId: string; amountPoisha: bigint }>,
): Promise<void> {
  for (const allocation of allocations) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: allocation.invoiceId } });
    const paid = invoice.paidPoisha - allocation.amountPoisha;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidPoisha: paid,
        ...(invoice.status === 'VOID'
          ? {}
          : { status: invoiceStatusFor(invoice.amountPoisha, paid) }),
      },
    });
  }
}

export interface PostedPayment {
  payment: PaymentWithRelations;
  activated: boolean;
}

export class PaymentRepository {
  constructor(
    private readonly db: Database,
    private readonly smsLocale: Language,
    private readonly templates: SmsTemplateStore,
  ) {}

  /**
   * Posts a payment in ONE transaction: the customer row is locked, money is allocated to the oldest
   * unpaid invoices first (FIFO), any surplus becomes customer credit, and the "payment received"
   * SMS is queued. Either everything is saved or nothing is.
   */
  post(input: RecordPaymentInput, receivedBy: string, now: Date): Promise<PostedPayment> {
    return this.db.$transaction(async (tx) => {
      const credit = await lockCustomer(tx, input.customerId);
      if (credit === null) throw new NotFoundError('Customer not found.');

      const { open, allocations, remaining } = await allocateFifo(
        tx,
        input.customerId,
        BigInt(input.amountPoisha),
      );

      const receiptRows = await tx.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT nextval('receipt_seq') AS n`;
      const receiptNumber = `R${String(receiptRows[0]?.n ?? 0n).padStart(6, '0')}`;

      const created = await tx.payment.create({
        data: {
          receiptNumber,
          customerId: input.customerId,
          amountPoisha: BigInt(input.amountPoisha),
          creditPoisha: remaining,
          method: input.method,
          bkashTrxId: input.bkashTrxId ?? null,
          note: input.note ?? null,
          receivedBy,
          receivedAt: now,
          allocations: { create: allocations },
        },
      });
      if (remaining > 0n) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: { creditPoisha: { increment: remaining } },
        });
      }

      const activated =
        (await activateIfFirstPaymentDone(tx, input.customerId)) ||
        (await reactivateIfCleared(tx, input.customerId, dhakaToday(now)));

      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: input.customerId },
        select: { fullName: true, phone: true, smsOptOut: true },
      });
      if (!customer.smsOptOut) {
        const stillDue = open.reduce(
          (sum, inv, i) =>
            sum + (inv.amountPoisha - inv.paidPoisha - (allocations[i]?.amountPoisha ?? 0n)),
          0n,
        );
        await enqueueSms(tx, [
          {
            type: 'PAYMENT_RECEIVED',
            customerId: input.customerId,
            paymentId: created.id,
            phone: customer.phone,
            scheduledFor: now,
            body: paymentReceivedText(
              this.smsLocale,
              {
                name: customer.fullName,
                amount: takaText(BigInt(input.amountPoisha)),
                receipt: receiptNumber,
                remaining: takaText(stillDue),
              },
              (await this.templates.customFor(this.smsLocale, tx)).paymentReceived,
            ),
          },
        ]);
      }

      const full = await tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: PAYMENT_INCLUDE,
      });
      return { payment: full, activated };
    });
  }

  /** Undoes a payment: invoices go back to their previous state and surplus credit is removed. */
  reverse(
    paymentId: string,
    reversedBy: string,
    reason: string,
    now: Date,
  ): Promise<PaymentWithRelations> {
    return this.db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundError('Payment not found.');

      const credit = await lockCustomer(tx, payment.customerId);
      // Re-read inside the lock so two admins cannot reverse the same payment twice.
      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { status: true },
      });
      if (fresh.status !== 'POSTED') throw new ConflictError('This payment was already reversed.');
      if ((credit ?? 0n) < payment.creditPoisha) {
        throw new ConflictError('The surplus credit from this payment has already been used.');
      }

      await releaseAllocations(tx, payment.allocations);
      if (payment.creditPoisha > 0n) {
        await tx.customer.update({
          where: { id: payment.customerId },
          data: { creditPoisha: { decrement: payment.creditPoisha } },
        });
      }
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'REVERSED', reversedAt: now, reversedBy, reverseReason: reason },
      });
      await tx.smsMessage.updateMany({
        where: { paymentId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
    });
  }

  /**
   * Moves a posted payment to another customer (it was entered on the wrong person). The receipt number and
   * any bKash link stay; the old customer's invoices are reopened and the new customer's oldest bills are paid.
   */
  move(
    paymentId: string,
    toCustomerId: string,
    now: Date,
  ): Promise<{ payment: PaymentWithRelations; activated: boolean }> {
    return this.db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundError('Payment not found.');
      if (payment.customerId === toCustomerId) {
        throw new ConflictError('Choose a different customer.');
      }
      // Lock both customers in a fixed order so two simultaneous moves cannot deadlock.
      const ids = [payment.customerId, toCustomerId].sort();
      const credits = new Map<string, bigint | null>();
      for (const id of ids) credits.set(id, await lockCustomer(tx, id));
      if (credits.get(toCustomerId) === null) throw new NotFoundError('Customer not found.');

      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { status: true, customerId: true },
      });
      if (fresh.status !== 'POSTED' || fresh.customerId !== payment.customerId) {
        throw new ConflictError('This payment was changed meanwhile. Reload and try again.');
      }
      if ((credits.get(payment.customerId) ?? 0n) < payment.creditPoisha) {
        throw new ConflictError('The surplus credit from this payment has already been used.');
      }

      await releaseAllocations(tx, payment.allocations);
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      if (payment.creditPoisha > 0n) {
        await tx.customer.update({
          where: { id: payment.customerId },
          data: { creditPoisha: { decrement: payment.creditPoisha } },
        });
      }

      const { allocations, remaining } = await allocateFifo(tx, toCustomerId, payment.amountPoisha);
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          customerId: toCustomerId,
          creditPoisha: remaining,
          movedFromCustomerId: payment.customerId,
          movedAt: now,
          allocations: { create: allocations },
        },
      });
      if (remaining > 0n) {
        await tx.customer.update({
          where: { id: toCustomerId },
          data: { creditPoisha: { increment: remaining } },
        });
      }
      await tx.bkashTransaction.updateMany({
        where: { paymentId },
        data: { customerId: toCustomerId },
      });
      // The "payment received" text already went to the old customer's phone; nothing is re-sent.
      const activated =
        (await activateIfFirstPaymentDone(tx, toCustomerId)) ||
        (await reactivateIfCleared(tx, toCustomerId, dhakaToday(now)));
      return {
        payment: await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          include: PAYMENT_INCLUDE,
        }),
        activated,
      };
    });
  }

  async receiptInfo(customerId: string) {
    const customer = await this.db.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { phone: true, address: true },
    });
    const rows = await this.db.$queryRaw<Array<{ due: bigint | null }>>`
      SELECT COALESCE(SUM(amount_poisha - paid_poisha), 0)::bigint AS due
      FROM invoices WHERE customer_id = ${customerId}::uuid AND status IN ('ISSUED', 'PARTIALLY_PAID')`;
    return {
      customerPhone: customer.phone,
      customerAddress: customer.address,
      outstandingPoisha: Number(rows[0]?.due ?? 0n),
    };
  }

  findById(id: string): Promise<PaymentWithRelations | null> {
    return this.db.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
  }

  listByCustomer(customerId: string): Promise<PaymentWithRelations[]> {
    return this.db.payment.findMany({
      where: { customerId },
      include: PAYMENT_INCLUDE,
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
  }

  async list(query: ListPaymentsQuery) {
    const where = query.method ? { method: query.method } : {};
    const [items, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.payment.count({ where }),
    ]);
    return { items, total };
  }
}
