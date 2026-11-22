import type { PaymentDto } from '@isp/contracts';
import type {
  Customer,
  Payment,
  PaymentAllocation,
  User,
  Invoice,
} from '../../generated/prisma/client.js';

export type PaymentWithRelations = Payment & {
  customer: Pick<Customer, 'customerCode' | 'fullName'>;
  receiver: Pick<User, 'fullName'>;
  allocations: Array<PaymentAllocation & { invoice: Pick<Invoice, 'invoiceNumber'> }>;
};

export const PAYMENT_INCLUDE = {
  customer: { select: { customerCode: true, fullName: true } },
  receiver: { select: { fullName: true } },
  allocations: {
    include: { invoice: { select: { invoiceNumber: true } } },
    orderBy: { invoice: { period: 'asc' } },
  },
} as const;

export function toPaymentDto(payment: PaymentWithRelations): PaymentDto {
  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    customerId: payment.customerId,
    customerCode: payment.customer.customerCode,
    customerName: payment.customer.fullName,
    amountPoisha: Number(payment.amountPoisha),
    creditPoisha: Number(payment.creditPoisha),
    method: payment.method,
    bkashTrxId: payment.bkashTrxId,
    status: payment.status,
    receivedByName: payment.receiver.fullName,
    receivedAt: payment.receivedAt.toISOString(),
    reversedAt: payment.reversedAt?.toISOString() ?? null,
    reverseReason: payment.reverseReason,
    note: payment.note,
    movedAt: payment.movedAt?.toISOString() ?? null,
    allocations: payment.allocations.map((a) => ({
      invoiceNumber: a.invoice.invoiceNumber,
      amountPoisha: Number(a.amountPoisha),
    })),
  };
}
