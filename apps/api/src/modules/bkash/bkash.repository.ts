import type { BkashReviewReason, BkashTxStatus, ListBkashTransactionsQuery } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import { BKASH_INCLUDE, type BkashTransactionWithRelations } from './bkash.mapper.js';

export interface NewBkashTransaction {
  trxId: string;
  amountPoisha: bigint;
  senderPhone: string | null;
  reference: string | null;
  occurredAt: Date;
  status: BkashTxStatus;
  reviewReason?: BkashReviewReason | undefined;
  suggestedCustomerId?: string | undefined;
  customerId?: string | undefined;
  paymentId?: string | undefined;
  batchId: string;
}

export interface BatchCounts {
  posted: number;
  verified: number;
  review: number;
  duplicates: number;
  invalid: number;
}

export class BkashRepository {
  constructor(private readonly db: Database) {}

  createBatch(fileName: string, uploadedBy: string, totalRows: number) {
    return this.db.bkashImportBatch.create({
      data: {
        fileName,
        uploadedBy,
        totalRows,
        postedCount: 0,
        verifiedCount: 0,
        reviewCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
      },
    });
  }

  /** One batch per day collects all SMS-forwarded payments. */
  async findOrCreateBatch(fileName: string, uploadedBy: string) {
    const existing = await this.db.bkashImportBatch.findFirst({ where: { fileName } });
    return existing ?? this.createBatch(fileName, uploadedBy, 0);
  }

  bumpBatch(id: string, outcome: 'posted' | 'verified' | 'review' | 'duplicate') {
    const field = {
      posted: 'postedCount',
      verified: 'verifiedCount',
      review: 'reviewCount',
      duplicate: 'duplicateCount',
    }[outcome];
    return this.db.bkashImportBatch.update({
      where: { id },
      data: { totalRows: { increment: 1 }, [field]: { increment: 1 } },
    });
  }

  finishBatch(id: string, counts: BatchCounts) {
    return this.db.bkashImportBatch.update({
      where: { id },
      data: {
        postedCount: counts.posted,
        verifiedCount: counts.verified,
        reviewCount: counts.review,
        duplicateCount: counts.duplicates,
        invalidCount: counts.invalid,
      },
    });
  }

  async transactionExists(trxId: string): Promise<boolean> {
    return (await this.db.bkashTransaction.count({ where: { trxId } })) > 0;
  }

  findPaymentByTrxId(trxId: string) {
    return this.db.payment.findFirst({
      where: { bkashTrxId: trxId },
      select: { id: true, customerId: true, amountPoisha: true, status: true },
    });
  }

  findCustomerByCode(code: string) {
    return this.db.customer.findFirst({
      where: { customerCode: { equals: code, mode: 'insensitive' } },
      select: { id: true, status: true },
    });
  }

  /** Customers whose main or alternative number equals `phone` (at most 2: we only care if exactly one). */
  findCustomersByPhone(phone: string) {
    return this.db.customer.findMany({
      where: { OR: [{ phone }, { altPhone: phone }], status: { not: 'TERMINATED' } },
      select: { id: true },
      take: 2,
    });
  }

  insertTransaction(data: NewBkashTransaction) {
    return this.db.bkashTransaction.create({
      data: {
        trxId: data.trxId,
        amountPoisha: data.amountPoisha,
        senderPhone: data.senderPhone,
        reference: data.reference,
        occurredAt: data.occurredAt,
        status: data.status,
        reviewReason: data.reviewReason ?? null,
        suggestedCustomerId: data.suggestedCustomerId ?? null,
        customerId: data.customerId ?? null,
        paymentId: data.paymentId ?? null,
        batchId: data.batchId,
      },
    });
  }

  findById(id: string): Promise<BkashTransactionWithRelations | null> {
    return this.db.bkashTransaction.findUnique({ where: { id }, include: BKASH_INCLUDE });
  }

  async list(query: ListBkashTransactionsQuery) {
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await this.db.$transaction([
      this.db.bkashTransaction.findMany({
        where,
        include: BKASH_INCLUDE,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.bkashTransaction.count({ where }),
    ]);
    return { items, total };
  }

  async countNeedsReview(): Promise<number> {
    return this.db.bkashTransaction.count({ where: { status: 'NEEDS_REVIEW' } });
  }

  /** Conditional update: only a still-pending row can be resolved (protects against two admins at once). */
  async resolve(
    id: string,
    data: {
      status: 'ASSIGNED' | 'IGNORED';
      resolvedBy: string;
      resolvedAt: Date;
      customerId?: string;
      paymentId?: string;
      ignoreReason?: string;
    },
  ): Promise<boolean> {
    const result = await this.db.bkashTransaction.updateMany({
      where: { id, status: 'NEEDS_REVIEW' },
      data: {
        status: data.status,
        resolvedBy: data.resolvedBy,
        resolvedAt: data.resolvedAt,
        customerId: data.customerId ?? null,
        paymentId: data.paymentId ?? null,
        ignoreReason: data.ignoreReason ?? null,
      },
    });
    return result.count === 1;
  }
}
