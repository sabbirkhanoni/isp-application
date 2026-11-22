import type { DbTransaction } from '../../shared/database/transaction.js';
import { enqueueNetworkSync } from '../network/network-queue.js';

/**
 * "Activate after first payment": once the customer has a fully paid invoice, move
 * PENDING_ACTIVATION -> ACTIVE. Returns true when the status changed.
 * The router job is queued in the same transaction.
 */
export async function activateIfFirstPaymentDone(
  tx: DbTransaction,
  customerId: string,
): Promise<boolean> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { status: true, subscription: { select: { activationPolicy: true } } },
  });
  if (customer?.status !== 'PENDING_ACTIVATION') return false;
  if (customer.subscription?.activationPolicy !== 'AFTER_FIRST_PAYMENT') return false;

  const paid = await tx.invoice.count({
    where: { customerId, status: 'PAID', amountPoisha: { gt: 0 } },
  });
  if (paid === 0) return false;

  await tx.customer.update({ where: { id: customerId }, data: { status: 'ACTIVE' } });
  await enqueueNetworkSync(tx, customerId);
  return true;
}

/**
 * Lifts a non-payment suspension once nothing is past its due date any more.
 * Manual suspensions are never lifted automatically. Returns true when the customer was reconnected.
 */
export async function reactivateIfCleared(
  tx: DbTransaction,
  customerId: string,
  today: Date,
): Promise<boolean> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { status: true, suspendReason: true },
  });
  if (customer?.status !== 'SUSPENDED' || customer.suspendReason !== 'NON_PAYMENT') return false;

  const overdue = await tx.invoice.count({
    where: { customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: today } },
  });
  if (overdue > 0) return false;

  await tx.customer.update({
    where: { id: customerId },
    data: { status: 'ACTIVE', suspendReason: null, suspendedAt: null },
  });
  await enqueueNetworkSync(tx, customerId);
  return true;
}

/** Serialises money operations per customer: concurrent payments/invoices wait for each other. */
export async function lockCustomer(tx: DbTransaction, customerId: string): Promise<bigint | null> {
  const rows = await tx.$queryRaw<Array<{ credit_poisha: bigint }>>`
    SELECT credit_poisha FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
  return rows[0]?.credit_poisha ?? null;
}
