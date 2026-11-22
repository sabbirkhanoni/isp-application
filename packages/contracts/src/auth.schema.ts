import { z } from 'zod';
import { LANGUAGES } from './enums.js';

export const MIN_PASSWORD_LENGTH = 10;

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(64),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updatePreferencesSchema = z.object({
  language: z.enum(LANGUAGES),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
