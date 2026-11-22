import type { Prisma } from '../../generated/prisma/client.js';

/** The client type inside `db.$transaction(async (tx) => ...)`. */
export type DbTransaction = Prisma.TransactionClient;
