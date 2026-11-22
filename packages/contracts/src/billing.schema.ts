import { z } from 'zod';
import {
  emptyToUndefined,
  optionalTextSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common.schema.js';
import { INVOICE_STATUSES, PAYMENT_METHODS } from './enums.js';
import type { InvoiceStatus, PaymentMethod, PaymentStatus } from './enums.js';

/** Billing month as "YYYY-MM" (Asia/Dhaka calendar month). */
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const recordPaymentSchema = z
  .object({
    customerId: uuidSchema,
    /** Integer poisha; the UI converts from taka. */
    amountPoisha: z.number().int().min(100).max(10_000_000_00),
    method: z.enum(PAYMENT_METHODS),
    bkashTrxId: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{8,12}$/, 'Invalid bKash transaction ID')
        .optional(),
    ),
    note: z.preprocess(emptyToUndefined, optionalTextSchema.optional()),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'BKASH' && !value.bkashTrxId) {
      ctx.addIssue({
        code: 'custom',
        path: ['bkashTrxId'],
        message: 'bKash transaction ID is required',
      });
    }
  });
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const reversePaymentSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

export const generateInvoicesSchema = z.object({
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
});
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(INVOICE_STATUSES).optional()),
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
  /** Only invoices that still have an amount to pay. */
  unpaidOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  method: z.preprocess(emptyToUndefined, z.enum(PAYMENT_METHODS).optional()),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

const MAX_AMOUNT_POISHA = 10_000_000_00;

/** Extra charge (positive) or one-time discount (negative) for one customer; billed on the next/open invoice. */
export const createChargeSchema = z.object({
  description: z.string().trim().min(2).max(80),
  amountPoisha: z
    .number()
    .int()
    .min(-MAX_AMOUNT_POISHA)
    .max(MAX_AMOUNT_POISHA)
    .refine((v) => v !== 0, 'Amount cannot be zero'),
});
export type CreateChargeInput = z.infer<typeof createChargeSchema>;

/** Standing monthly discount for one customer (0 removes it). */
export const setDiscountSchema = z.object({
  monthlyDiscountPoisha: z.number().int().min(0).max(MAX_AMOUNT_POISHA),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
});
export type SetDiscountInput = z.infer<typeof setDiscountSchema>;

export const movePaymentSchema = z.object({
  toCustomerId: uuidSchema,
  reason: z.string().trim().min(3).max(300),
});
export type MovePaymentInput = z.infer<typeof movePaymentSchema>;

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(40).default(''),
  footer: z.string().trim().max(160).default(''),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const billingSettingsSchema = z.object({
  /** Bill a new customer only for the days left in the joining month. */
  prorateNewCustomers: z.boolean(),
  business: businessProfileSchema,
  /** Suspend customers automatically once their bill is overdue by more than `graceDays`. */
  autoSuspend: z
    .object({ enabled: z.boolean(), graceDays: z.number().int().min(0).max(60) })
    .default({ enabled: false, graceDays: 3 }),
});
export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export interface InvoiceLineDto {
  kind: 'PACKAGE' | 'DISCOUNT' | 'ONE_TIME' | 'PRORATION';
  description: string;
  /** Signed: discounts are negative. */
  amountPoisha: number;
}

export interface InvoiceDetailDto extends InvoiceDto {
  creditAppliedPoisha: number;
  customerPhone: string;
  customerAddress: string;
  lines: InvoiceLineDto[];
  payments: Array<{
    receiptNumber: string;
    amountPoisha: number;
    method: PaymentMethod;
    receivedAt: string;
    status: PaymentStatus;
  }>;
}

export interface ChargeDto {
  id: string;
  description: string;
  amountPoisha: number;
  status: 'PENDING' | 'BILLED' | 'CANCELLED';
  invoiceNumber: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  period: string;
  amountPoisha: number;
  paidPoisha: number;
  dueDate: string;
  status: InvoiceStatus;
  issuedAt: string;
}

export interface PaymentDto {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  amountPoisha: number;
  /** Part of the payment that was not needed by any invoice and became customer credit. */
  creditPoisha: number;
  method: PaymentMethod;
  bkashTrxId: string | null;
  status: PaymentStatus;
  receivedByName: string;
  receivedAt: string;
  reversedAt: string | null;
  reverseReason: string | null;
  note: string | null;
  movedAt: string | null;
  allocations: Array<{ invoiceNumber: string; amountPoisha: number }>;
}

export interface ReceiptDto extends PaymentDto {
  customerPhone: string;
  customerAddress: string;
  /** Total still unpaid by the customer right after this payment (today's figure). */
  outstandingPoisha: number;
}

export interface CustomerBillingDto {
  creditPoisha: number;
  outstandingPoisha: number;
  monthlyDiscountPoisha: number;
  discountNote: string | null;
  /** Package price after the standing discount: what one month costs this customer. */
  monthlyNetPoisha: number;
  charges: ChargeDto[];
  invoices: InvoiceDto[];
  payments: PaymentDto[];
}

export interface GenerateInvoicesResultDto {
  period: string;
  created: number;
}
