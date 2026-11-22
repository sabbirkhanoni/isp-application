import type { InvoiceDto } from '@isp/contracts';
import type { Customer, Invoice } from '../../generated/prisma/client.js';
import { formatDateOnly, formatPeriod } from '../../shared/utils/dhaka-time.js';

export type InvoiceWithCustomer = Invoice & {
  customer: Pick<Customer, 'customerCode' | 'fullName'>;
};

export function toInvoiceDto(invoice: InvoiceWithCustomer): InvoiceDto {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerCode: invoice.customer.customerCode,
    customerName: invoice.customer.fullName,
    period: formatPeriod(invoice.period),
    amountPoisha: Number(invoice.amountPoisha),
    paidPoisha: Number(invoice.paidPoisha),
    dueDate: formatDateOnly(invoice.dueDate),
    status: invoice.status,
    issuedAt: invoice.issuedAt.toISOString(),
  };
}
