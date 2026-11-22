import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

export type Database = PrismaClient;

export function createDatabase(connectionString: string, poolMax: number): Database {
  const adapter = new PrismaPg({ connectionString, max: poolMax });
  return new PrismaClient({ adapter });
}
