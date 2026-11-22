import { z } from 'zod';

const nameSchema = z.string().trim().min(2).max(60);
const pppProfileSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,64}$/, 'Use letters, digits, dot, dash or underscore');

export const createPackageSchema = z.object({
  name: nameSchema,
  speedMbps: z.number().int().min(1).max(100_000),
  /** Integer poisha (100 poisha = 1 BDT). */
  monthlyPricePoisha: z.number().int().min(0).max(100_000_000),
  pppProfile: pppProfileSchema.optional(),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z
  .object({
    name: nameSchema,
    speedMbps: z.number().int().min(1).max(100_000),
    monthlyPricePoisha: z.number().int().min(0).max(100_000_000),
    pppProfile: pppProfileSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export interface PackageDto {
  id: string;
  name: string;
  speedMbps: number;
  monthlyPricePoisha: number;
  pppProfile: string | null;
  isActive: boolean;
}
