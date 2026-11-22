import { z } from 'zod';
import { activationFields, requirePppoeUsername } from './customers.schema.js';
import {
  addressSchema,
  emptyToUndefined,
  optionalTextSchema,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  uuidSchema,
} from './common.schema.js';
import { CONNECTION_TYPES, LEAD_STATUSES } from './enums.js';
import type { ConnectionType, LeadStatus } from './enums.js';

export const createLeadSchema = z.object({
  fullName: personNameSchema,
  phone: phoneSchema,
  address: addressSchema,
  area: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  requestedPackageId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  connectionType: z.enum(CONNECTION_TYPES).default('PPPOE'),
  note: z.preprocess(emptyToUndefined, optionalTextSchema.optional()),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** Admin decision: which package, how it connects, and when internet is switched on. */
export const approveLeadSchema = z.object(activationFields).superRefine(requirePppoeUsername);
export type ApproveLeadInput = z.infer<typeof approveLeadSchema>;

export const rejectLeadSchema = z.object({ reason: z.string().trim().max(300).optional().nullable() });
export type RejectLeadInput = z.infer<typeof rejectLeadSchema>;

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(LEAD_STATUSES).optional()),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export interface LeadDto {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  area: string | null;
  requestedPackageId: string | null;
  requestedPackageName: string | null;
  connectionType: ConnectionType;
  note: string | null;
  status: LeadStatus;
  rejectReason: string | null;
  customerId: string | null;
  createdByName: string;
  createdAt: string;
  reviewedAt: string | null;
}
