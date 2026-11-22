import type { DbTransaction } from '../../shared/database/transaction.js';

/**
 * Asks the network module to make the router match the customer's current status.
 * Written inside the caller's transaction (outbox pattern), so a status change and its router job are
 * saved together or not at all. Repeated requests collapse into one waiting job per customer.
 * Only PPPoE customers with an assigned router are managed; others are a no-op.
 */
export async function enqueueNetworkSync(tx: DbTransaction, customerId: string): Promise<boolean> {
  const sub = await tx.subscription.findUnique({
    where: { customerId },
    select: { connectionType: true, routerId: true, pppoeUsername: true },
  });
  if (!sub || sub.connectionType !== 'PPPOE' || !sub.routerId || !sub.pppoeUsername) return false;

  await tx.$executeRaw`
    INSERT INTO network_jobs (customer_id, router_id)
    VALUES (${customerId}::uuid, ${sub.routerId}::uuid)
    ON CONFLICT (customer_id) WHERE status = 'PENDING'
    DO UPDATE SET router_id = EXCLUDED.router_id, run_after = NULL, attempts = 0, last_error = NULL`;
  return true;
}

/** Router state a customer status maps to: only ACTIVE customers are online. */
export function desiredStateFor(status: string): 'ENABLED' | 'DISABLED' {
  return status === 'ACTIVE' ? 'ENABLED' : 'DISABLED';
}
