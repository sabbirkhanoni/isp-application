import type {
  AssignBkashTransactionInput,
  BkashImportResultDto,
  BkashTransactionDto,
  IgnoreBkashTransactionInput,
  ImportBkashStatementInput,
  ListBkashTransactionsQuery,
  PaginationMeta,
} from '@isp/contracts';
import { isUniqueViolation } from '../../shared/database/errors.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { PaymentRepository } from '../payments/payments.repository.js';
import { toBkashTransactionDto } from './bkash.mapper.js';
import type { BatchCounts, BkashRepository } from './bkash.repository.js';
import { parseBkashSms } from './sms-parser.js';
import type { HookStatus, SmsHookStore } from './sms-hook.store.js';
import {
  StatementFormatError,
  parseStatement,
  type ParsedStatementRow,
} from './statement-parser.js';

const MAX_PROBLEMS_SHOWN = 20;
const IMPORT_NOTE = 'bKash statement import';

type RowOutcome = 'posted' | 'verified' | 'review' | 'duplicate';

interface RowOptions {
  source: 'statement' | 'sms';
  note: string;
  /** SMS forwards: credit automatically when the sender's number belongs to exactly one customer. */
  autoMatchByPhone: boolean;
}

const STATEMENT_OPTIONS: RowOptions = {
  source: 'statement',
  note: IMPORT_NOTE,
  autoMatchByPhone: false,
};

export type SmsIngestResult = 'posted' | 'verified' | 'review' | 'duplicate' | 'ignored';

export class BkashService {
  constructor(
    private readonly repo: BkashRepository,
    private readonly payments: PaymentRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly hook: SmsHookStore,
  ) {}

  // ---- bKash SMS forwarding ------------------------------------------------------------------

  hookStatus(): Promise<HookStatus> {
    return this.hook.status();
  }

  async enableHook(actor: AuthContext, ctx: RequestContext): Promise<string> {
    const token = await this.hook.enable(actor.userId);
    await this.recordHookAudit(actor, ctx, 'enabled');
    return token;
  }

  async disableHook(actor: AuthContext, ctx: RequestContext): Promise<void> {
    await this.hook.disable(actor.userId);
    await this.recordHookAudit(actor, ctx, 'disabled');
  }

  async setHookAutoMatch(actor: AuthContext, value: boolean): Promise<void> {
    await this.hook.setAutoMatch(value, actor.userId);
  }

  private recordHookAudit(actor: AuthContext, ctx: RequestContext, state: string) {
    return this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.BKASH_HOOK_CHANGED,
      targetType: 'bkash_hook',
      targetId: 'bkash_sms_hook',
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { state },
    });
  }

  /**
   * Called by the phone's SMS-forwarder app. Returns null when the token is wrong (caller answers 401).
   * A message that is not an incoming bKash payment is acknowledged and dropped. Never credits twice:
   * the transaction ID is recorded once, whatever the number of retries.
   */
  async ingestSms(
    token: string,
    message: string,
    ctx: RequestContext,
  ): Promise<SmsIngestResult | null> {
    const hook = await this.hook.authenticate(token);
    if (!hook) return null;
    const now = this.clock.now();
    const row = parseBkashSms(message, now);
    if (!row) return 'ignored';
    const batch = await this.repo.findOrCreateBatch(
      `SMS forward ${now.toISOString().slice(0, 10)}`,
      hook.userId,
    );
    const outcome = await this.processRow(row, batch.id, { userId: hook.userId }, ctx, {
      source: 'sms',
      note: 'bKash SMS forward',
      autoMatchByPhone: hook.autoMatchByPhone,
    });
    await this.repo.bumpBatch(batch.id, outcome);
    await this.hook.touch();
    return outcome;
  }

  /**
   * Imports a statement. Safe to upload the same file (or an overlapping one) again: every
   * transaction ID is recorded once, so nothing is ever credited twice.
   *
   * Per row, in order:
   *  1. already known                      -> duplicate (ignored)
   *  2. an admin already entered this ID   -> VERIFIED if the amount matches, otherwise flagged for review
   *  3. reference equals a customer ID     -> credited automatically (same allocation engine as cash)
   *  4. anything else                      -> review queue, with a suggestion when the sender's number
   *                                           belongs to exactly one customer
   */
  async importStatement(
    actor: AuthContext,
    input: ImportBkashStatementInput,
    ctx: RequestContext,
  ): Promise<BkashImportResultDto> {
    let parsed;
    try {
      parsed = parseStatement(input.csv);
    } catch (error) {
      if (error instanceof StatementFormatError) {
        throw new ValidationError('Validation failed.', [{ path: 'csv', message: error.message }]);
      }
      throw error;
    }

    const slice = parsed.rows.slice(input.offset, input.offset + input.limit);
    const nextOffset =
      input.offset + input.limit < parsed.rows.length ? input.offset + input.limit : null;
    const firstSlice = input.offset === 0;
    const batch = await this.repo.createBatch(
      input.offset === 0 ? input.fileName : `${input.fileName} (from row ${input.offset + 1})`,
      actor.userId,
      slice.length,
    );
    const counts: BatchCounts = {
      posted: 0,
      verified: 0,
      review: 0,
      duplicates: 0,
      // Unreadable rows are reported once, with the first slice.
      invalid: firstSlice ? parsed.problems.length : 0,
    };
    for (const row of slice) {
      const outcome = await this.processRow(row, batch.id, actor, ctx, STATEMENT_OPTIONS);
      if (outcome === 'posted') counts.posted += 1;
      else if (outcome === 'verified') counts.verified += 1;
      else if (outcome === 'review') counts.review += 1;
      else counts.duplicates += 1;
    }
    await this.repo.finishBatch(batch.id, counts);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.BKASH_STATEMENT_IMPORTED,
      targetType: 'bkash_import',
      targetId: batch.id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        fileName: input.fileName,
        offset: input.offset,
        rowsInSlice: slice.length,
        ...counts,
      },
    });

    return {
      batchId: batch.id,
      nextOffset,
      totalRows: parsed.totalRows,
      posted: counts.posted,
      verified: counts.verified,
      needsReview: counts.review,
      duplicates: counts.duplicates,
      invalid: counts.invalid,
      problems: (firstSlice ? parsed.problems : [])
        .slice(0, MAX_PROBLEMS_SHOWN)
        .map((p) => `Row ${p.line}: ${p.message}`),
    };
  }

  private async processRow(
    row: ParsedStatementRow,
    batchId: string,
    actor: { userId: string },
    ctx: RequestContext,
    opts: RowOptions,
  ): Promise<RowOutcome> {
    if (await this.repo.transactionExists(row.trxId)) return 'duplicate';

    const base = {
      trxId: row.trxId,
      amountPoisha: row.amountPoisha,
      senderPhone: row.senderPhone,
      reference: row.reference,
      occurredAt: row.occurredAt,
      batchId,
    };

    // 2. A manually entered payment with this transaction ID: confirm it instead of paying twice.
    const existing = await this.repo.findPaymentByTrxId(row.trxId);
    if (existing) {
      const matches = existing.status === 'POSTED' && existing.amountPoisha === row.amountPoisha;
      await this.repo.insertTransaction({
        ...base,
        status: matches ? 'VERIFIED' : 'NEEDS_REVIEW',
        reviewReason: matches ? undefined : 'AMOUNT_MISMATCH',
        customerId: existing.customerId,
        paymentId: matches ? existing.id : undefined,
      });
      return matches ? 'verified' : 'review';
    }

    // 3. Reference = customer ID -> automatic credit.
    const byCode = row.reference ? await this.repo.findCustomerByCode(row.reference) : null;
    let target = byCode && byCode.status !== 'TERMINATED' ? byCode : null;

    // 4. Phone fallback (SMS only, when enabled): exactly one customer owns the sender's number.
    const byPhone = row.senderPhone ? await this.repo.findCustomersByPhone(row.senderPhone) : [];
    const suggested = byPhone.length === 1 ? byPhone[0] : undefined;
    if (!target && opts.autoMatchByPhone && suggested)
      target = { id: suggested.id, status: 'ACTIVE' };

    if (target) {
      try {
        const { payment } = await this.payments.post(
          {
            customerId: target.id,
            amountPoisha: Number(row.amountPoisha),
            method: 'BKASH',
            bkashTrxId: row.trxId,
            note: opts.note,
          },
          actor.userId,
          this.clock.now(),
        );
        await this.repo.insertTransaction({
          ...base,
          status: 'POSTED',
          customerId: target.id,
          paymentId: payment.id,
        });
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
            method: 'BKASH',
            source: opts.source,
            trxId: row.trxId,
            matchedBy: byCode && target.id === byCode.id ? 'reference' : 'phone',
          },
        });
        return 'posted';
      } catch (error) {
        if (isUniqueViolation(error)) return 'duplicate';
        throw error;
      }
    }

    // 5. Needs a human. Suggest a customer only when the sender's number identifies exactly one.
    await this.repo.insertTransaction({
      ...base,
      status: 'NEEDS_REVIEW',
      reviewReason: suggested ? 'PHONE_SUGGESTION' : 'NO_REFERENCE_MATCH',
      suggestedCustomerId: suggested?.id,
    });
    return 'review';
  }

  async list(query: ListBkashTransactionsQuery) {
    const { items, total } = await this.repo.list(query);
    const result: {
      items: BkashTransactionDto[];
      pagination: PaginationMeta;
      needsReview: number;
    } = {
      items: items.map(toBkashTransactionDto),
      pagination: { page: query.page, limit: query.limit, total },
      needsReview: await this.repo.countNeedsReview(),
    };
    return result;
  }

  /** Admin confirms which customer a queued transaction belongs to; it is then credited like any payment. */
  async assign(
    actor: AuthContext,
    id: string,
    input: AssignBkashTransactionInput,
    ctx: RequestContext,
  ): Promise<BkashTransactionDto> {
    const tx = await this.repo.findById(id);
    if (!tx) throw new NotFoundError('Transaction not found.');
    if (tx.status !== 'NEEDS_REVIEW')
      throw new ConflictError('This transaction was already handled.');

    let paymentId: string;
    try {
      const { payment } = await this.payments.post(
        {
          customerId: input.customerId,
          amountPoisha: Number(tx.amountPoisha),
          method: 'BKASH',
          bkashTrxId: tx.trxId,
          note: IMPORT_NOTE,
        },
        actor.userId,
        this.clock.now(),
      );
      paymentId = payment.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'A payment with this bKash transaction ID already exists. Ignore this row instead.',
        );
      }
      throw error;
    }

    const resolved = await this.repo.resolve(id, {
      status: 'ASSIGNED',
      resolvedBy: actor.userId,
      resolvedAt: this.clock.now(),
      customerId: input.customerId,
      paymentId,
    });
    if (!resolved) throw new ConflictError('This transaction was already handled.');
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.BKASH_TRANSACTION_ASSIGNED,
      targetType: 'bkash_transaction',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { trxId: tx.trxId, customerId: input.customerId, paymentId },
    });
    return toBkashTransactionDto((await this.repo.findById(id))!);
  }

  async ignore(
    actor: AuthContext,
    id: string,
    input: IgnoreBkashTransactionInput,
    ctx: RequestContext,
  ): Promise<BkashTransactionDto> {
    const tx = await this.repo.findById(id);
    if (!tx) throw new NotFoundError('Transaction not found.');
    const resolved = await this.repo.resolve(id, {
      status: 'IGNORED',
      resolvedBy: actor.userId,
      resolvedAt: this.clock.now(),
      ignoreReason: input.reason,
    });
    if (!resolved) throw new ConflictError('This transaction was already handled.');
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.BKASH_TRANSACTION_IGNORED,
      targetType: 'bkash_transaction',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { trxId: tx.trxId, reason: input.reason },
    });
    return toBkashTransactionDto((await this.repo.findById(id))!);
  }
}
