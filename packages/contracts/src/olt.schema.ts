import { z } from 'zod';
import { emptyToUndefined, paginationQuerySchema } from './common.schema.js';

export const OLT_BRANDS = ['BDCOM', 'HUAWEI', 'VSOL_EPON', 'VSOL_GPON', 'CDATA'] as const;
export type OltBrand = (typeof OLT_BRANDS)[number];

/** Below this the customer is likely to call soon; below FIBER_CRITICAL_DBM the line is in trouble. */
export const FIBER_WARN_DBM = -25;
export const FIBER_CRITICAL_DBM = -27;
export type FiberLevel = 'GOOD' | 'WEAK' | 'CRITICAL';

export function fiberLevel(rxDbm: number): FiberLevel {
  if (rxDbm < FIBER_CRITICAL_DBM) return 'CRITICAL';
  if (rxDbm < FIBER_WARN_DBM) return 'WEAK';
  return 'GOOD';
}

const oid = z
  .string()
  .trim()
  .regex(/^\.?\d+(\.\d+)+$/, 'An OID looks like 1.3.6.1.4.1.3320.101.10.5.1.5');
const optionalOid = z.preprocess(emptyToUndefined, oid.optional());

const oltFields = {
  name: z.string().trim().min(2).max(60),
  brand: z.enum(OLT_BRANDS),
  host: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9.-]+$/, 'Use a hostname or IP address'),
  snmpPort: z.coerce.number().int().min(1).max(65535).default(161),
  rxOid: optionalOid,
  idOid: optionalOid,
  divisor: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10000).optional()),
};

export const createOltSchema = z
  .object({ ...oltFields, community: z.string().trim().min(1).max(64) })
  .superRefine((v, ctx) => {
    if (v.brand === 'CDATA' && !v.rxOid) {
      ctx.addIssue({
        code: 'custom',
        path: ['rxOid'],
        message: 'Required for this brand: ask your OLT vendor for the ONU optical RX power OID',
      });
    }
  });
export type CreateOltInput = z.infer<typeof createOltSchema>;

/** A blank community keeps the saved one. */
export const updateOltSchema = z.object({
  ...oltFields,
  community: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(64).optional()),
  isActive: z.boolean().default(true),
});
export type UpdateOltInput = z.infer<typeof updateOltSchema>;

export const listFiberQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['ALL', 'CRITICAL', 'WEAK', 'GOOD', 'UNMATCHED']).default('ALL'),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
});
export type ListFiberQuery = z.infer<typeof listFiberQuerySchema>;

export interface OltDto {
  id: string;
  name: string;
  brand: OltBrand;
  host: string;
  snmpPort: number;
  rxOid: string | null;
  idOid: string | null;
  divisor: number | null;
  isActive: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  onuCount: number;
  criticalCount: number;
}

export interface OltTestSampleDto {
  onuIndex: string;
  onuKey: string;
  raw: string;
  rxDbm: number | null;
}

export interface OltTestResultDto {
  ok: boolean;
  message: string;
  samples: OltTestSampleDto[];
}

export interface FiberRowDto {
  oltName: string;
  onuIndex: string;
  onuKey: string;
  rxDbm: number;
  level: FiberLevel;
  updatedAt: string;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  phone: string | null;
}

export interface FiberSummary {
  total: number;
  good: number;
  weak: number;
  critical: number;
}

export interface CustomerFiberDto {
  rxDbm: number;
  level: FiberLevel;
  updatedAt: string;
  oltName: string;
}
