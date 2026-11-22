import { z } from 'zod';
import { ACTIVATION_POLICIES, CONNECTION_TYPES, CUSTOMER_STATUSES } from './enums.js';
import type { ConnectionType, ActivationPolicy, CustomerStatus, SuspendReason } from './enums.js';
import { SUSPEND_REASONS } from './enums.js';
import {
  addressSchema,
  emptyToUndefined,
  optionalTextSchema,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  uuidSchema,
} from './common.schema.js';

/** Existing customer IDs are kept verbatim, so the format is deliberately permissive. */
export const customerCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, 'Use letters, digits, dot, dash, slash or underscore');

export const pppoeUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._@-]+$/, 'Use letters, digits, dot, dash, underscore or @');

/** Connection + activation fields shared by "approve lead" and "create customer directly". */
export const pppoePasswordSchema = z
  .string()
  .min(6)
  .max(64)
  .regex(/^[\x21-\x7E]+$/, 'Use visible characters without spaces');

/** Optional OLT / ONU details for fibre customers (free text; all optional). */
const oltText = z.string().trim().max(60);
export const fiberFields = {
  oltName: oltText.nullable(),
  ponPort: oltText.nullable(),
  onuSerial: oltText.nullable(),
};

export const activationFields = {
  packageId: uuidSchema,
  connectionType: z.enum(CONNECTION_TYPES),
  pppoeUsername: z.preprocess(emptyToUndefined, pppoeUsernameSchema.optional()),
  activationPolicy: z.enum(ACTIVATION_POLICIES),
  customerCode: z.preprocess(emptyToUndefined, customerCodeSchema.optional()),
  routerId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  /** Only used when the system creates the PPPoE account on the router; generated when left empty. */
  pppoePassword: z.preprocess(emptyToUndefined, pppoePasswordSchema.optional()),
};

export function requirePppoeUsername(
  value: { connectionType: ConnectionType; pppoeUsername?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.connectionType === 'PPPOE' && !value.pppoeUsername) {
    ctx.addIssue({
      code: 'custom',
      path: ['pppoeUsername'],
      message: 'PPPoE username is required',
    });
  }
}

export const createCustomerSchema = z
  .object({
    fullName: personNameSchema,
    phone: phoneSchema,
    altPhone: z.preprocess(emptyToUndefined, phoneSchema.optional()),
    address: addressSchema,
    area: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    note: z.preprocess(emptyToUndefined, optionalTextSchema.optional()),
    oltName: z.preprocess(emptyToUndefined, oltText.optional()),
    ponPort: z.preprocess(emptyToUndefined, oltText.optional()),
    onuSerial: z.preprocess(emptyToUndefined, oltText.optional()),
    ...activationFields,
  })
  .superRefine(requirePppoeUsername);
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    fullName: personNameSchema,
    phone: phoneSchema,
    altPhone: phoneSchema.nullable(),
    address: addressSchema,
    area: z.string().trim().max(80).nullable(),
    note: optionalTextSchema.nullable(),
    routerId: uuidSchema.nullable(),
    /** Plan change: the router profile switches now; the new price applies from the next invoice. */
    packageId: uuidSchema,
    /** true = this customer receives no SMS at all. */
    smsOptOut: z.boolean(),
    /** Free / VIP line: bills of 0 and never suspended automatically. Admin only. */
    isFree: z.boolean(),
    ...fiberFields,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(CUSTOMER_STATUSES).optional()),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export interface SubscriptionDto {
  packageId: string;
  packageName: string;
  monthlyPricePoisha: number;
  connectionType: ConnectionType;
  pppoeUsername: string | null;
  activationPolicy: ActivationPolicy;
  routerId: string | null;
  routerName: string | null;
  /** The system holds a password it can create the router account with. */
  hasPppoePassword: boolean;
  oltName: string | null;
  ponPort: string | null;
  onuSerial: string | null;
}

export interface CustomerBillingPeriodDto {
  startDate: string;
  expiryDate: string;
}

export interface CustomerDto {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  altPhone: string | null;
  address: string;
  area: string | null;
  note: string | null;
  smsOptOut: boolean;
  isFree: boolean;
  status: CustomerStatus;
  suspendReason: SuspendReason | null;
  subscription: SubscriptionDto | null;
  billingPeriod?: CustomerBillingPeriodDto | null;
  createdAt: string;
}

export const terminateCustomerSchema = z.object({
  /** Why the customer left (free text, for the record). */
  note: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  /** Reduce this month's unpaid bill for the days after the customer left. */
  prorateBill: z.boolean().default(false),
});
export type TerminateCustomerInput = z.infer<typeof terminateCustomerSchema>;

export const suspendCustomerSchema = z.object({
  reason: z.enum(SUSPEND_REASONS).default('NON_PAYMENT'),
});
export type SuspendCustomerInput = z.infer<typeof suspendCustomerSchema>;
