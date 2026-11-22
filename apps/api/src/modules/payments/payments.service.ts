import type {
  ListPaymentsQuery,
  PaginationMeta,
  PaymentDto,
  RecordPaymentInput,
  MovePaymentInput,
  ReceiptDto,
  ReversePaymentInput,
} from '@isp/contracts';
import { isUniqueViolation } from '../../shared/database/errors.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toPaymentDto } from './payments.mapper.js';
import type { PaymentRepository } from './payments.repository.js';

export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async record(
    actor: AuthContext,
    input: RecordPaymentInput,
    ctx: RequestContext,
  ): Promise<PaymentDto> {
    // bKash entries carry a transaction ID that can later be verified against statements, so only admins add them.
    if (input.method === 'BKASH' && !actor.permissions.includes('PAYMENT_RECORD_BKASH')) {
      throw new ForbiddenError();
    }
    let posted;
    try {
      posted = await this.payments.post(input, actor.userId, this.clock.now());
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictError('This bKash transaction ID was already recorded.');
      throw error;
    }
    const { payment, activated } = posted;
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.PAYMENT_RECORDED,
      targetType: 'payment',
      targetId: payment.id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        receipt: payment.receiptNumber,
        method: payment.method,
        amountPoisha: Number(payment.amountPoisha),
      },
    });
    if (activated) {
      await this.audit.record({
        actorUserId: actor.userId,
        action: AUDIT_ACTIONS.CUSTOMER_ACTIVATED,
        targetType: 'customer',
        targetId: payment.customerId,
        outcome: 'SUCCESS',
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        metadata: { reason: 'first payment' },
      });
    }
    return toPaymentDto(payment);
  }

  async reverse(
    actor: AuthContext,
    paymentId: string,
    input: ReversePaymentInput,
    ctx: RequestContext,
  ): Promise<PaymentDto> {
    const payment = await this.payments.reverse(
      paymentId,
      actor.userId,
      input.reason,
      this.clock.now(),
    );
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.PAYMENT_REVERSED,
      targetType: 'payment',
      targetId: paymentId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { receipt: payment.receiptNumber, reason: input.reason },
    });
    return toPaymentDto(payment);
  }

  async move(
    actor: AuthContext,
    paymentId: string,
    input: MovePaymentInput,
    ctx: RequestContext,
  ): Promise<PaymentDto> {
    const before = await this.payments.findById(paymentId);
    const { payment } = await this.payments.move(paymentId, input.toCustomerId, this.clock.now());
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.PAYMENT_MOVED,
      targetType: 'payment',
      targetId: paymentId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        receipt: payment.receiptNumber,
        from: before?.customer.customerCode ?? null,
        to: payment.customer.customerCode,
        reason: input.reason,
      },
    });
    return toPaymentDto(payment);
  }

  /** Everything a printed receipt needs, including what the customer still owes today. */
  async receipt(id: string): Promise<ReceiptDto> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new NotFoundError('Payment not found.');
    const info = await this.payments.receiptInfo(payment.customerId);
    return { ...toPaymentDto(payment), ...info };
  }

  async list(
    query: ListPaymentsQuery,
  ): Promise<{ items: PaymentDto[]; pagination: PaginationMeta }> {
    const { items, total } = await this.payments.list(query);
    return {
      items: items.map(toPaymentDto),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async listByCustomer(customerId: string): Promise<PaymentDto[]> {
    return (await this.payments.listByCustomer(customerId)).map(toPaymentDto);
  }
}
