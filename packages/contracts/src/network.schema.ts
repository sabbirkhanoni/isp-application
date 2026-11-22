import { z } from 'zod';
import { NETWORK_JOB_STATUSES, ROUTER_DRIVERS } from './enums.js';
import type { NetworkJobStatus, RouterDriver } from './enums.js';
import { paginationQuerySchema, emptyToUndefined } from './common.schema.js';

const routerName = z.string().trim().min(2).max(60);
const host = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9.-]+$/, 'Use a hostname or IP address, without https:// or a path');

const routerFields = {
  name: routerName,
  driver: z.enum(ROUTER_DRIVERS),
  host: z.preprocess(emptyToUndefined, host.optional()),
  port: z.coerce.number().int().min(1).max(65535).default(443),
  useTls: z.boolean().default(true),
  /** RouterOS usually ships a self-signed certificate; allow it only for a router you control. */
  allowSelfSigned: z.boolean().default(false),
  username: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(64).optional()),
  password: z.preprocess(emptyToUndefined, z.string().min(1).max(128).optional()),
};

export const createRouterSchema = z.object(routerFields).superRefine((value, ctx) => {
  if (value.driver !== 'REST') return;
  for (const field of ['host', 'username', 'password'] as const) {
    if (!value[field]) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Required for a direct connection' });
    }
  }
});
export type CreateRouterInput = z.infer<typeof createRouterSchema>;

/** A blank password keeps the saved one. */
export const updateRouterSchema = z
  .object({
    name: routerName,
    host: host.nullable(),
    port: routerFields.port,
    useTls: z.boolean(),
    allowSelfSigned: z.boolean(),
    username: z.string().trim().min(1).max(64).nullable(),
    password: routerFields.password,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateRouterInput = z.infer<typeof updateRouterSchema>;

export const listNetworkJobsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(NETWORK_JOB_STATUSES).optional()),
});
export type ListNetworkJobsQuery = z.infer<typeof listNetworkJobsQuerySchema>;

/** Sent by the router agent after it tried a job. */
export const agentJobResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().max(300).optional(),
  /** false = do not retry (for example the PPPoE user does not exist on the router). */
  retryable: z.boolean().default(true),
  /** true = the agent had to create the PPPoE account (it did not exist on the router). */
  secretCreated: z.boolean().default(false),
});
export type AgentJobResultInput = z.infer<typeof agentJobResultSchema>;

export interface RouterDto {
  id: string;
  name: string;
  driver: RouterDriver;
  host: string | null;
  port: number;
  useTls: boolean;
  allowSelfSigned: boolean;
  username: string | null;
  hasPassword: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  customerCount: number;
  /** Logins currently online on this router (from the last poll). */
  onlineCount: number;
}

/** The agent token is shown exactly once, when it is created or rotated. */
export interface RouterWithTokenDto {
  router: RouterDto;
  agentToken: string | null;
}

export interface RouterTestResultDto {
  ok: boolean;
  message: string;
}

export interface NetworkJobDto {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  routerId: string;
  routerName: string;
  status: NetworkJobStatus;
  attempts: number;
  lastError: string | null;
  appliedState: 'ENABLED' | 'DISABLED' | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AgentJobDto {
  id: string;
  pppoeUsername: string;
  desiredState: 'ENABLED' | 'DISABLED';
  /** Router profile (speed) to apply; null = leave as is. */
  profile: string | null;
  /** Used only if the account does not exist yet and has to be created. */
  password: string | null;
}

// ---- live line status (Phase 8) ----
export const LINE_FILTERS = ['ALL', 'ONLINE', 'OFFLINE', 'NEVER_SEEN'] as const;
export type LineFilter = (typeof LINE_FILTERS)[number];

export const listLinesQuerySchema = z.object({
  filter: z.enum(LINE_FILTERS).default('ALL'),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListLinesQuery = z.infer<typeof listLinesQuerySchema>;

/** What the agent reports: raw PPPoE sessions as RouterOS lists them ("uptime" is e.g. "1d2h3m4s"). */
export const agentSessionsSchema = z.object({
  /** Full PPP secret list; sent every few minutes for the compare report. */
  secrets: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        profile: z.string().max(80).nullish(),
        disabled: z.boolean(),
      }),
    )
    .max(10_000)
    .optional(),
  sessions: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        address: z.string().max(60).nullish(),
        callerId: z.string().max(60).nullish(),
        uptime: z.string().max(40).nullish(),
        /** Session byte counters (rx = from the customer, tx = to the customer). */
        rxBytes: z.number().int().min(0).nullish(),
        txBytes: z.number().int().min(0).nullish(),
      }),
    )
    .max(10_000),
});
export type AgentSessionsInput = z.infer<typeof agentSessionsSchema>;

/** NEVER_SEEN = the router has not listed this login since monitoring began (or it was never connected). */
export type LineState = 'ONLINE' | 'OFFLINE' | 'NEVER_SEEN';

export interface LineDto {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  customerStatus: string;
  routerId: string;
  routerName: string;
  pppoeUsername: string;
  state: LineState;
  address: string | null;
  callerId: string | null;
  onlineSince: string | null;
  lastOnlineAt: string | null;
  /** When the router was last asked successfully; old values mean the state below may be stale. */
  routerCheckedAt: string | null;
  /** Set when the last attempt to reach the router failed. */
  routerError: string | null;
}

export interface LineSummary {
  managed: number;
  online: number;
  offline: number;
  neverSeen: number;
  /** Customers whose account is ACTIVE but whose line is offline: the ones to look at first. */
  activeButOffline: number;
}

// ---- router compare report (Phase 9) ----
export interface RouterSyncReportDto {
  routerId: string;
  routerName: string;
  /** null = the router's account list has never been read. */
  checkedAt: string | null;
  routerCount: number;
  /** Accounts on the router that no customer uses. */
  routerOnly: Array<{ name: string; profile: string | null; disabled: boolean }>;
  /** Customers whose PPPoE user is missing on the router. */
  missingOnRouter: Array<{
    customerId: string;
    customerCode: string;
    customerName: string;
    pppoeUsername: string;
    /** The system holds a password, so "fix" can create the account. */
    canCreate: boolean;
  }>;
  /** Customers whose router profile or on/off state differs from the system. */
  mismatches: Array<{
    customerId: string;
    customerCode: string;
    customerName: string;
    pppoeUsername: string;
    wantedProfile: string | null;
    routerProfile: string | null;
    wantedDisabled: boolean;
    routerDisabled: boolean;
  }>;
}

export interface RouterFixResultDto {
  queued: number;
}
