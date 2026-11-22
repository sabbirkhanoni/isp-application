import { z } from 'zod';

export const SYSTEM_CHECK_KEYS = [
  'database',
  'migrations',
  'backgroundJobs',
  'sms',
  'ownerPhone',
  'routers',
  'routerDryRun',
  'routerSecret',
  'autoSuspend',
  'invoices',
  'smsFailures',
  'networkFailures',
  'backups',
] as const;
export type SystemCheckKey = (typeof SYSTEM_CHECK_KEYS)[number];

export interface SystemCheckItem {
  key: SystemCheckKey;
  /** ok = fine, info = for your knowledge, warn = look at it, bad = fix before going live. */
  status: 'ok' | 'info' | 'warn' | 'bad';
  /** Short machine-made detail such as a count or a name; the screen adds the explanation. */
  detail: string | null;
}

export const DATA_QUALITY_KEYS = [
  'duplicatePhone',
  'duplicatePppoe',
  'invalidPhone',
  'pppoeNoRouter',
  'invoiceMismatch',
] as const;
export type DataQualityKey = (typeof DATA_QUALITY_KEYS)[number];

export interface DataQualitySample {
  customerId: string;
  customerCode: string;
  fullName: string;
  detail: string | null;
}
export interface DataQualityGroup {
  key: DataQualityKey;
  count: number;
  samples: DataQualitySample[];
}

export const EXPORT_NAMES = ['customers', 'invoices', 'payments'] as const;
export type ExportName = (typeof EXPORT_NAMES)[number];
export const exportParamSchema = z.object({ name: z.enum(EXPORT_NAMES) });
