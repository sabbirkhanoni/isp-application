import type {
  BillingSettings,
  CustomerBillingDto,
  InvoiceDetailDto,
  GenerateInvoicesResultDto,
  InvoiceDto,
  ListInvoicesQuery,
  PaginationMeta,
} from '@isp/contracts';
import { isUniqueViolation } from '../../shared/database/errors.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logger/logger.js';
import type { Clock } from '../../shared/utils/clock.js';
import { currentPeriod, dhakaToday, periodStart } from '../../shared/utils/dhaka-time.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { PaymentService } from '../payments/payments.service.js';
import { toChargeDto } from '../adjustments/adjustments.service.js';
import { toInvoiceDto } from './billing.mapper.js';
import type { BillingSettingsStore } from './billing-settings.store.js';
import type { BillingRepository } from './billing.repository.js';

export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly settings: BillingSettingsStore,
    private readonly payments: PaymentService,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /**
   * Issues the invoice of `period` (default: this month) for every billable customer that has none.
   * Idempotent: running it twice, or on two servers, never creates duplicates.
   * New customers pay the full month unless "prorate new customers" is switched on in the billing settings.
   */
  async generateForPeriod(period?: string): Promise<GenerateInvoicesResultDto> {
    const now = this.clock.now();
    const target = period ?? currentPeriod(now);
    if (target > currentPeriod(now)) {
      throw new ValidationError('Validation failed.', [
        { path: 'period', message: 'Cannot bill a future month' },
      ]);
    }
    const start = periodStart(target);
    const today = dhakaToday(now);

    let created = 0;
    const settings = await this.settings.get();
    for (const customer of await this.repo.findCustomersMissingInvoice(start)) {
      if (!customer.subscription) continue;
      try {
        const result = await this.repo.issueInvoice(customer, settings, start, today, now);
        if (result.created) created += 1;
      } catch (error) {
        if (isUniqueViolation(error)) continue; // issued concurrently by another run
        this.logger.error({ customerId: customer.id, err: error }, 'Failed to issue invoice');
      }
    }
    return { period: target, created };
  }

  async generateByAdmin(actor: AuthContext, period: string | undefined, ctx: RequestContext) {
    const result = await this.generateForPeriod(period);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.INVOICES_GENERATED,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { period: result.period, created: result.created },
    });
    return result;
  }

  async list(
    query: ListInvoicesQuery,
  ): Promise<{ items: InvoiceDto[]; pagination: PaginationMeta }> {
    const { items, total } = await this.repo.list(
      query,
      query.period ? periodStart(query.period) : undefined,
    );
    return {
      items: items.map(toInvoiceDto),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async customerBilling(customerId: string): Promise<CustomerBillingDto> {
    const balance = await this.repo.customerBalance(customerId);
    if (!balance) throw new NotFoundError('Customer not found.');
    const [invoices, payments] = await Promise.all([
      this.repo.listByCustomer(customerId),
      this.payments.listByCustomer(customerId),
    ]);
    const { subscription, charges } = await this.repo.customerExtras(customerId);
    const discount = subscription?.monthlyDiscountPoisha ?? 0n;
    const price = subscription?.package.monthlyPricePoisha ?? 0n;
    return {
      creditPoisha: Number(balance.creditPoisha),
      outstandingPoisha: Number(balance.outstandingPoisha),
      monthlyDiscountPoisha: Number(discount),
      discountNote: subscription?.discountNote ?? null,
      monthlyNetPoisha: Number(price > discount ? price - discount : 0n),
      charges: charges.map(toChargeDto),
      invoices: invoices.map(toInvoiceDto),
      payments,
    };
  }

  async invoiceDetail(id: string): Promise<InvoiceDetailDto> {
    const invoice = await this.repo.findDetail(id);
    if (!invoice) throw new NotFoundError('Invoice not found.');
    return {
      ...toInvoiceDto(invoice),
      creditAppliedPoisha: Number(invoice.creditAppliedPoisha),
      customerPhone: invoice.customer.phone,
      customerAddress: invoice.customer.address,
      lines: invoice.lines.map((l) => ({
        kind: l.kind,
        description: l.description,
        amountPoisha: Number(l.amountPoisha),
      })),
      payments: invoice.allocations
        .filter((a) => a.payment.status === 'POSTED')
        .map((a) => ({
          receiptNumber: a.payment.receiptNumber,
          amountPoisha: Number(a.amountPoisha),
          method: a.payment.method,
          receivedAt: a.payment.receivedAt.toISOString(),
          status: a.payment.status,
        })),
    };
  }

  getSettings(): Promise<BillingSettings> {
    return this.settings.get();
  }

  async saveSettings(
    actor: AuthContext,
    input: BillingSettings,
    ctx: RequestContext,
  ): Promise<BillingSettings> {
    await this.settings.save(input, actor.userId);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.BILLING_SETTINGS_UPDATED,
      targetType: 'billing_settings',
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        prorateNewCustomers: input.prorateNewCustomers,
        autoSuspend: input.autoSuspend,
      },
    });
    return this.settings.get();
  }
}
