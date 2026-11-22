import type {
  CustomerDto,
  SuspendCustomerInput,
  SuspendReason,
  TerminateCustomerInput,
} from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { DbTransaction } from '../../shared/database/transaction.js';
import { addDays, currentPeriod, dhakaToday, periodStart } from '../../shared/utils/dhaka-time.js';
import { adjustInvoice } from '../billing/invoice-adjust.js';
import { daysInMonth, min, prorate } from '../billing/invoice-math.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { enqueueNetworkSync } from '../network/network-queue.js';
import { lockCustomer } from './customer-activation.js';
import { toCustomerDto } from './customers.mapper.js';
import type { CustomerRepository } from './customers.repository.js';

/** Suspend / (re)activate a customer. Every change queues the matching router job in the same transaction. */
export class CustomerStatusService {
  constructor(
    private readonly db: Database,
    private readonly customers: CustomerRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async suspend(
    actor: AuthContext,
    id: string,
    input: SuspendCustomerInput,
    ctx: RequestContext,
  ): Promise<CustomerDto> {
    await this.applySuspension(id, input.reason);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_SUSPENDED,
      targetType: 'customer',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { reason: input.reason, source: 'manual' },
    });
    return this.fresh(id);
  }

  /**
   * Marks a customer as having left. The router account is switched off (status is no longer ACTIVE),
   * unpaid bills stay on the Dues list, and no further bills are generated.
   */
  async terminate(
    actor: AuthContext,
    id: string,
    input: TerminateCustomerInput,
    ctx: RequestContext,
  ): Promise<CustomerDto> {
    let prorated = 0n;
    const previous = await this.db.$transaction(async (tx) => {
      if ((await lockCustomer(tx, id)) === null) throw new NotFoundError('Customer not found.');
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (customer.status === 'TERMINATED') {
        throw new ConflictError('This customer has already left.');
      }
      await tx.customer.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          terminatedAt: this.clock.now(),
          suspendReason: null,
          suspendedAt: null,
          ...(input.note ? { note: input.note } : {}),
        },
      });
      await enqueueNetworkSync(tx, id);
      if (input.prorateBill) {
        prorated = await this.prorateCurrentBill(tx, id);
      }
      return customer.status;
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_TERMINATED,
      targetType: 'customer',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        from: previous,
        hasNote: Boolean(input.note),
        proratedPoisha: Number(prorated),
      },
    });
    return this.fresh(id);
  }

  /**
   * Takes the unused days of this month off the unpaid part of the customer's bill. The month's package
   * price (after the standing discount) is spread over its days; the leaving day counts as used.
   * Paid money is never touched, so a fully paid bill stays as it is.
   */
  private async prorateCurrentBill(tx: DbTransaction, customerId: string): Promise<bigint> {
    const today = dhakaToday(this.clock.now());
    const invoice = await tx.invoice.findFirst({
      where: {
        customerId,
        period: periodStart(currentPeriod(this.clock.now())),
        status: { not: 'VOID' },
      },
      include: { lines: true },
    });
    if (!invoice) return 0n;
    const total = daysInMonth(invoice.period);
    const unusedDays = total - today.getUTCDate();
    const monthly = invoice.lines
      .filter((l) => l.kind !== 'ONE_TIME')
      .reduce((sum, l) => sum + l.amountPoisha, 0n);
    const wanted = prorate(monthly, unusedDays, total);
    const credit = min(wanted, invoice.amountPoisha - invoice.paidPoisha);
    if (credit <= 0n) return 0n;
    await adjustInvoice(tx, invoice.id, {
      kind: 'PRORATION',
      description: `${unusedDays}/${total} days`,
      amountPoisha: -credit,
    });
    return credit;
  }

  /** Switches a PENDING_ACTIVATION, SUSPENDED or former (TERMINATED) customer on. */
  async activate(actor: AuthContext, id: string, ctx: RequestContext): Promise<CustomerDto> {
    const previous = await this.db.$transaction(async (tx) => {
      if ((await lockCustomer(tx, id)) === null) throw new NotFoundError('Customer not found.');
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (customer.status === 'ACTIVE') {
        throw new ConflictError('This customer is already active.');
      }
      await tx.customer.update({
        where: { id },
        data: { status: 'ACTIVE', suspendReason: null, suspendedAt: null, terminatedAt: null },
      });
      await enqueueNetworkSync(tx, id);
      return customer.status;
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_ACTIVATED,
      targetType: 'customer',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { from: previous, source: 'manual' },
    });
    return this.fresh(id);
  }

  /**
   * Optional automation (AUTO_SUSPEND=true): suspends active customers whose bill is more than
   * `graceDays` past its due date. Idempotent: suspended customers are not touched again.
   */
  async autoSuspendOverdue(graceDays: number): Promise<number> {
    const cutoff = addDays(dhakaToday(this.clock.now()), -graceDays);
    const overdue = await this.db.customer.findMany({
      where: {
        status: 'ACTIVE',
        isFree: false,
        invoices: {
          some: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: cutoff } },
        },
      },
      select: { id: true },
    });
    let suspended = 0;
    for (const { id } of overdue) {
      try {
        await this.applySuspension(id, 'NON_PAYMENT', cutoff);
      } catch (error) {
        if (error instanceof ConflictError) continue; // changed meanwhile, e.g. paid just now
        throw error;
      }
      await this.audit.record({
        actorUserId: null,
        action: AUDIT_ACTIONS.CUSTOMER_SUSPENDED,
        targetType: 'customer',
        targetId: id,
        outcome: 'SUCCESS',
        metadata: { reason: 'NON_PAYMENT', source: 'auto' },
      });
      suspended += 1;
    }
    return suspended;
  }

  /** `overdueBefore` (automatic path only): re-checked under the lock in case the customer just paid. */
  private applySuspension(id: string, reason: SuspendReason, overdueBefore?: Date): Promise<void> {
    return this.db.$transaction(async (tx) => {
      if ((await lockCustomer(tx, id)) === null) throw new NotFoundError('Customer not found.');
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (customer.status !== 'ACTIVE') {
        throw new ConflictError('Only active customers can be suspended.');
      }
      if (overdueBefore) {
        const overdue = await tx.invoice.count({
          where: {
            customerId: id,
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            dueDate: { lt: overdueBefore },
          },
        });
        if (overdue === 0) throw new ConflictError('Nothing is overdue any more.');
      }
      await tx.customer.update({
        where: { id },
        data: { status: 'SUSPENDED', suspendReason: reason, suspendedAt: this.clock.now() },
      });
      await enqueueNetworkSync(tx, id);
    });
  }

  private async fresh(id: string): Promise<CustomerDto> {
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundError('Customer not found.');
    return toCustomerDto(customer);
  }
}
