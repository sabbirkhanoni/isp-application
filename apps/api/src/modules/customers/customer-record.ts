import type { ActivationPolicy, ConnectionType } from '@isp/contracts';
import type { Customer, Subscription } from '../../generated/prisma/client.js';
import { isUniqueViolation } from '../../shared/database/errors.js';
import type { DbTransaction } from '../../shared/database/transaction.js';
import { enqueueNetworkSync } from '../network/network-queue.js';
import { ConflictError, ValidationError } from '../../shared/errors/app-error.js';

export interface NewCustomerRecord {
  customerCode?: string | undefined;
  fullName: string;
  phone: string;
  altPhone?: string | undefined;
  address: string;
  area?: string | undefined;
  note?: string | undefined;
  packageId: string;
  connectionType: ConnectionType;
  pppoeUsername?: string | undefined;
  activationPolicy: ActivationPolicy;
  routerId?: string | undefined;
  /** Already encrypted (see PppoeCredentials). */
  pppoePasswordEnc?: string | undefined;
  oltName?: string | undefined;
  ponPort?: string | undefined;
  onuSerial?: string | undefined;
  createdBy: string;
  /** Day the customer joined (Dhaka). Leave out for customers who were already online before the system. */
  joinedOn?: Date | undefined;
}

const GENERATED_CODE_PREFIX = 'C';
const GENERATED_CODE_WIDTH = 5;
const MAX_CODE_ATTEMPTS = 20;

async function codeExists(tx: DbTransaction, code: string): Promise<boolean> {
  const found = await tx.customer.findFirst({
    where: { customerCode: { equals: code, mode: 'insensitive' } },
    select: { id: true },
  });
  return found !== null;
}

/** Next free generated code (C00001, C00002, ...); skips codes already taken by imported IDs. */
async function generateCustomerCode(tx: DbTransaction): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('customer_code_seq') AS n`;
    const code = `${GENERATED_CODE_PREFIX}${String(rows[0]?.n ?? 0n).padStart(GENERATED_CODE_WIDTH, '0')}`;
    if (!(await codeExists(tx, code))) return code;
  }
  throw new ConflictError('Could not generate a free customer ID. Please try again.');
}

/**
 * Creates a customer and its subscription inside the caller's transaction.
 * Shared by "admin creates customer" and "admin approves lead" so both follow the same rules.
 */
export async function createCustomerWithSubscription(
  tx: DbTransaction,
  input: NewCustomerRecord,
): Promise<Customer & { subscription: Subscription }> {
  const pkg = await tx.package.findUnique({ where: { id: input.packageId } });
  if (!pkg || !pkg.isActive) {
    throw new ValidationError('Validation failed.', [
      { path: 'packageId', message: 'Choose an active package' },
    ]);
  }

  if (input.customerCode && (await codeExists(tx, input.customerCode))) {
    throw new ConflictError('This customer ID is already in use.');
  }
  if (input.pppoeUsername) {
    const taken = await tx.subscription.findFirst({
      where: { pppoeUsername: { equals: input.pppoeUsername, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) throw new ConflictError('This PPPoE username is already in use.');
  }

  if (input.routerId) {
    const router = await tx.router.findUnique({ where: { id: input.routerId } });
    if (!router?.isActive) {
      throw new ValidationError('Validation failed.', [
        { path: 'routerId', message: 'Choose an active router' },
      ]);
    }
  }

  const customerCode = input.customerCode ?? (await generateCustomerCode(tx));
  try {
    const customer = await tx.customer.create({
      data: {
        customerCode,
        fullName: input.fullName,
        phone: input.phone,
        altPhone: input.altPhone ?? null,
        address: input.address,
        area: input.area ?? null,
        note: input.note ?? null,
        // Only ACTIVATE_NOW goes live immediately; the other policies wait for the admin or the first payment.
        status: input.activationPolicy === 'ACTIVATE_NOW' ? 'ACTIVE' : 'PENDING_ACTIVATION',
        createdBy: input.createdBy,
        joinedOn: input.joinedOn ?? null,
        subscription: {
          create: {
            packageId: input.packageId,
            connectionType: input.connectionType,
            pppoeUsername: input.pppoeUsername ?? null,
            activationPolicy: input.activationPolicy,
            routerId: input.routerId ?? null,
            pppoePasswordEnc: input.pppoePasswordEnc ?? null,
            oltName: input.oltName ?? null,
            ponPort: input.ponPort ?? null,
            onuSerial: input.onuSerial ?? null,
          },
        },
      },
      include: { subscription: true },
    });
    if (customer.status === 'ACTIVE') await enqueueNetworkSync(tx, customer.id);
    return customer as Customer & { subscription: Subscription };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('This customer ID or PPPoE username is already in use.');
    }
    throw error;
  }
}
