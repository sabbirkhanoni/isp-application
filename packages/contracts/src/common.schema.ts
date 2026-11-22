import { z } from 'zod';

/** Accepts 01XXXXXXXXX, 8801XXXXXXXXX and +8801XXXXXXXXX; always stores 01XXXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?88)?01[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number')
  .transform((value) => value.replace(/^\+?88/, ''));

export const personNameSchema = z.string().trim().min(2).max(100);
export const addressSchema = z.string().trim().min(3).max(300);
export const optionalTextSchema = z.string().trim().max(500);
export const uuidSchema = z.string().uuid();

/** Optional text that the client may send as an empty string; empty becomes undefined. */
export const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
