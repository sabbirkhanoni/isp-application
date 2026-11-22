import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './auth.schema.js';
import { ROLES, USER_STATUSES } from './enums.js';
import { GRANTABLE_PERMISSIONS } from './permissions.js';

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Use 3-32 lowercase letters, digits, dot, dash or underscore');

const fullNameSchema = z.string().trim().min(2).max(100);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?88)?01[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number');

export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: fullNameSchema,
  phone: phoneSchema.optional(),
  role: z.enum(ROLES).default('STAFF'),
  temporaryPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema.nullable(),
    role: z.enum(ROLES),
    status: z.enum(USER_STATUSES),
    extraPermissions: z.array(z.enum(GRANTABLE_PERMISSIONS)).max(GRANTABLE_PERMISSIONS.length),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
