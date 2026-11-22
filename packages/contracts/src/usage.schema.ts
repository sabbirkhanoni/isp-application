import { z } from 'zod';
import { emptyToUndefined } from './common.schema.js';
import { periodSchema } from './billing.schema.js';

export const topUsageQuerySchema = z.object({
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(200).default(50)),
});
export type TopUsageQuery = z.infer<typeof topUsageQuerySchema>;

export interface UsageMonthDto {
  /** YYYY-MM */
  period: string;
  downloadBytes: number;
  uploadBytes: number;
}

export interface CustomerUsageDto {
  /** Newest month first; months without traffic are listed with zeros. */
  months: UsageMonthDto[];
  /** True when the customer has no PPPoE login or no router has reported counters yet. */
  noData: boolean;
}

export interface TopUsageRowDto {
  customerId: string;
  customerCode: string;
  customerName: string;
  pppoeUsername: string;
  downloadBytes: number;
  uploadBytes: number;
}
