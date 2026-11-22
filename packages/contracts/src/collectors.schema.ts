import { z } from 'zod';
import { periodSchema } from './billing.schema.js';

export const collectorOverviewQuerySchema = z.object({
  period: periodSchema.optional(),
});

export const setTargetSchema = z.object({
  userId: z.uuid(),
  period: periodSchema,
  /** 0 removes the target. */
  targetPoisha: z.number().int().min(0).max(100_000_000_000),
});
export type SetTargetInput = z.infer<typeof setTargetSchema>;

export const assignCollectorSchema = z
  .object({
    /** null = remove the assignment. */
    collectorId: z.uuid().nullable(),
    area: z.string().trim().min(1).max(100).optional(),
    customerCodes: z.array(z.string().trim().min(1).max(40)).max(2000).optional(),
  })
  .refine((v) => Boolean(v.area) !== Boolean(v.customerCodes?.length), {
    message: 'Choose either an area or a list of customer IDs.',
    path: ['area'],
  });
export type AssignCollectorInput = z.infer<typeof assignCollectorSchema>;

export interface AssignedCollectorRowDto {
  /** null = customers with no assigned collector. */
  userId: string | null;
  name: string;
  customers: number;
  billedPoisha: number;
  collectedPoisha: number;
  /** All unpaid bills of these customers, any month. */
  outstandingPoisha: number;
  /** null = no target set for the month. */
  targetPoisha: number | null;
}

export interface CollectorOverviewDto {
  period: string;
  rows: AssignedCollectorRowDto[];
  /** Every active staff member, so anyone can be given customers. */
  users: Array<{ id: string; name: string }>;
  areas: string[];
}

export interface TrendMonthDto {
  period: string;
  billedPoisha: number;
  collectedPoisha: number;
  /** Part of that month's bills still unpaid today. */
  unpaidPoisha: number;
}
