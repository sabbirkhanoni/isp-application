import type { ChargeDto, CreateChargeInput, SetDiscountInput } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { currentPeriod, periodStart } from '../../shared/utils/dhaka-time.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { lockCustomer } from '../customers/customer-activation.js';
import { adjustInvoice } from '../billing/invoice-adjust.js';

export function toChargeDto(charge: {
  id: string;
  description: string;
  amountPoisha: bigint;
  status: 'PENDING' | 'BILLED' | 'CANCELLED';
  createdAt: Date;
  invoice: { invoiceNumber: string } | null;
}): ChargeDto {
  return {
    id: charge.id,
    description: charge.description,
    amountPoisha: Number(charge.amountPoisha),
    status: charge.status,
    invoiceNumber: charge.invoice?.invoiceNumber ?? null,
    createdAt: charge.createdAt.toISOString(),
  };
}

/** Extra charges, one-time discounts and the standing monthly discount of a customer. */
export class AdjustmentsService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  /**
   * Records a charge (positive) or one-time discount (negative). If this month's invoice already exists
   * it goes onto that invoice right away; otherwise it waits for the next invoice.
   */
  async addCharge(
    actor: AuthContext,
    customerId: string,
    input: CreateChargeInput,
    ctx: RequestContext,
  ): Promise<ChargeDto> {
    const charge = await this.db.$transaction(async (tx) => {
      if ((await lockCustomer(tx, customerId)) === null) {
        throw new NotFoundError('Customer not found.');
      }
      const amount = BigInt(input.amountPoisha);
      const open = await tx.invoice.findFirst({
        where: {
          customerId,
          period: periodStart(currentPeriod(this.clock.now())),
          status: { not: 'VOID' },
        },
      });
      if (open) {
        await adjustInvoice(tx, open.id, {
          kind: 'ONE_TIME',
          description: input.description,
          amountPoisha: amount,
        });
      }
      return tx.charge.create({
        data: {
          customerId,
          description: input.description,
          amountPoisha: amount,
          createdBy: actor.userId,
          ...(open ? { status: 'BILLED' as const, invoiceId: open.id } : {}),
        },
        include: { invoice: { select: { invoiceNumber: true } } },
      });
    });
    await this.record(actor, ctx, AUDIT_ACTIONS.CHARGE_ADDED, customerId, {
      amountPoisha: input.amountPoisha,
      onInvoice: charge.invoice?.invoiceNumber ?? null,
    });
    return toChargeDto(charge);
  }

  /** Only a charge that has not been billed yet can be cancelled. */
  async cancelCharge(actor: AuthContext, chargeId: string, ctx: RequestContext): Promise<void> {
    const charge = await this.db.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new NotFoundError('Charge not found.');
    const result = await this.db.charge.updateMany({
      where: { id: chargeId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0) {
      throw new ConflictError('This charge is already on an invoice and cannot be cancelled.');
    }
    await this.record(actor, ctx, AUDIT_ACTIONS.CHARGE_CANCELLED, charge.customerId, {
      amountPoisha: Number(charge.amountPoisha),
    });
  }

  /** Standing monthly discount; applies from the next invoice. */
  async setDiscount(
    actor: AuthContext,
    customerId: string,
    input: SetDiscountInput,
    ctx: RequestContext,
  ): Promise<void> {
    const result = await this.db.subscription.updateMany({
      where: { customerId },
      data: {
        monthlyDiscountPoisha: BigInt(input.monthlyDiscountPoisha),
        discountNote: input.monthlyDiscountPoisha > 0 ? (input.note ?? null) : null,
      },
    });
    if (result.count === 0) throw new NotFoundError('Customer not found.');
    await this.record(actor, ctx, AUDIT_ACTIONS.DISCOUNT_SET, customerId, {
      monthlyDiscountPoisha: input.monthlyDiscountPoisha,
    });
  }

  private record(
    actor: AuthContext,
    ctx: RequestContext,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    customerId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'customer',
      targetId: customerId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}
