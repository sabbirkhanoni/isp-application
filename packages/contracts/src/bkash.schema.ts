import { z } from 'zod';
import { emptyToUndefined, paginationQuerySchema, uuidSchema } from './common.schema.js';
import { BKASH_TX_STATUSES } from './enums.js';
import type { BkashReviewReason, BkashTxStatus } from './enums.js';

/** The statement is sent as text (the browser reads the file); 2 MB is far above a month of transactions. */
export const importBkashStatementSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  csv: z.string().min(10).max(2_000_000),
  /**
   * A statement is processed in slices so no single request runs for long on a remote database.
   * The page keeps asking with the returned `nextOffset` until it is null. Re-sending is safe.
   */
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(300).default(100),
});
export type ImportBkashStatementInput = z.infer<typeof importBkashStatementSchema>;

export const listBkashTransactionsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(BKASH_TX_STATUSES).optional()),
});
export type ListBkashTransactionsQuery = z.infer<typeof listBkashTransactionsQuerySchema>;

export const assignBkashTransactionSchema = z.object({ customerId: uuidSchema });
export type AssignBkashTransactionInput = z.infer<typeof assignBkashTransactionSchema>;

export const ignoreBkashTransactionSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type IgnoreBkashTransactionInput = z.infer<typeof ignoreBkashTransactionSchema>;

export interface BkashCustomerRefDto {
  id: string;
  customerCode: string;
  fullName: string;
}

export interface BkashTransactionDto {
  id: string;
  trxId: string;
  amountPoisha: number;
  senderPhone: string | null;
  reference: string | null;
  occurredAt: string;
  status: BkashTxStatus;
  reviewReason: BkashReviewReason | null;
  suggestedCustomer: BkashCustomerRefDto | null;
  customer: BkashCustomerRefDto | null;
  receiptNumber: string | null;
  ignoreReason: string | null;
}

export interface BkashImportResultDto {
  /** Offset to send next, or null when the whole file has been processed. */
  nextOffset: number | null;
  batchId: string;
  totalRows: number;
  posted: number;
  verified: number;
  needsReview: number;
  duplicates: number;
  invalid: number;
  /** First few row problems, e.g. "Row 7: amount is not a number". */
  problems: string[];
}
