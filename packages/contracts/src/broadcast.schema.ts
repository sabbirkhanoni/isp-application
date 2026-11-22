import { z } from 'zod';

export const BROADCAST_MAX_RECIPIENTS = 2000;

export const broadcastAudienceSchema = z.object({
  /** Which customers: everyone with an active connection, suspended ones, or both. */
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ALL']).default('ACTIVE'),
  /** Exact area name (as typed on the customer). Empty = every area. */
  area: z.string().trim().max(100).optional(),
  /** Only customers who currently have an unpaid bill. */
  onlyWithDues: z.boolean().default(false),
  routerId: z.uuid().optional(),
});
export type BroadcastAudience = z.infer<typeof broadcastAudienceSchema>;

export const broadcastSchema = z.object({
  audience: broadcastAudienceSchema,
  /** {name} is replaced with the customer's name. */
  message: z.string().trim().min(5).max(300),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export interface BroadcastPreviewDto {
  recipients: number;
  /** Customers matching the filter who asked not to get SMS (not counted in recipients). */
  optedOut: number;
  tooMany: boolean;
  sample: string;
  areas: string[];
}

export interface BroadcastResultDto {
  queued: number;
}
