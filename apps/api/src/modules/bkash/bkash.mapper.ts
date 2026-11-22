import type { BkashTransactionDto } from '@isp/contracts';
import type { BkashTransaction, Customer, Payment } from '../../generated/prisma/client.js';

type CustomerRef = Pick<Customer, 'id' | 'customerCode' | 'fullName'>;

export type BkashTransactionWithRelations = BkashTransaction & {
  customer: CustomerRef | null;
  suggestedCustomer: CustomerRef | null;
  payment: Pick<Payment, 'receiptNumber'> | null;
};

export const BKASH_INCLUDE = {
  customer: { select: { id: true, customerCode: true, fullName: true } },
  suggestedCustomer: { select: { id: true, customerCode: true, fullName: true } },
  payment: { select: { receiptNumber: true } },
} as const;

const ref = (c: CustomerRef | null) =>
  c && { id: c.id, customerCode: c.customerCode, fullName: c.fullName };

export function toBkashTransactionDto(t: BkashTransactionWithRelations): BkashTransactionDto {
  return {
    id: t.id,
    trxId: t.trxId,
    amountPoisha: Number(t.amountPoisha),
    senderPhone: t.senderPhone,
    reference: t.reference,
    occurredAt: t.occurredAt.toISOString(),
    status: t.status,
    reviewReason: t.reviewReason,
    suggestedCustomer: ref(t.suggestedCustomer),
    customer: ref(t.customer),
    receiptNumber: t.payment?.receiptNumber ?? null,
    ignoreReason: t.ignoreReason,
  };
}
