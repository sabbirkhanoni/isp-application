import { ValidationError } from '../../shared/errors/app-error.js';
import type { DbTransaction } from '../../shared/database/transaction.js';
import { invoiceStatusFor, type InvoiceLineKind } from './invoice-math.js';

/**
 * Adds one line to an already issued invoice and moves its amount by the same signed amount.
 * A reduction can only take away what is still unpaid (paid money is never silently refunded).
 * The caller must hold the customer lock.
 */
export async function adjustInvoice(
  tx: DbTransaction,
  invoiceId: string,
  line: { kind: InvoiceLineKind; description: string; amountPoisha: bigint },
): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const amount = invoice.amountPoisha + line.amountPoisha;
  if (amount < invoice.paidPoisha) {
    throw new ValidationError('Validation failed.', [
      {
        path: 'amountPoisha',
        message: "This reduction is bigger than what is still unpaid on this month's bill",
      },
    ]);
  }
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPoisha: amount, status: invoiceStatusFor(amount, invoice.paidPoisha) },
  });
  await tx.invoiceLine.create({ data: { invoiceId, ...line } });
}
