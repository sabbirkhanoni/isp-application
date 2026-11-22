import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const listAuditQuerySchema = paginationQuerySchema.extend({
  /** "logins" = sign-in / sign-out / lock events only; "all" = everything. */
  group: z.preprocess(emptyToUndefined, z.enum(['all', 'logins', 'denied']).default('all')),
  actorUserId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  from: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  to: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export interface AuditLogDto {
  id: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  actorUsername: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
}
