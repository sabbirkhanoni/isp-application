import { z } from 'zod';
import type { Language } from './enums.js';

export const SMS_TEMPLATE_TYPES = ['reminder', 'paymentReceived'] as const;
export type SmsTemplateType = (typeof SMS_TEMPLATE_TYPES)[number];

/** Words an admin may put in braces, per message type. */
export const SMS_PLACEHOLDERS: Readonly<Record<SmsTemplateType, readonly string[]>> = {
  reminder: ['name', 'amountDue', 'dueDate'],
  paymentReceived: ['name', 'amount', 'receipt', 'remaining'],
};

export const SMS_TEMPLATE_MAX_LENGTH = 300;

export const updateSmsTemplateSchema = z
  .object({ template: z.string().trim().min(5).max(SMS_TEMPLATE_MAX_LENGTH) })
  .strict();
export type UpdateSmsTemplateInput = z.infer<typeof updateSmsTemplateSchema>;

/** Returns the unknown {words} in a template (empty when it is valid). */
export function unknownPlaceholders(type: SmsTemplateType, template: string): string[] {
  const allowed = SMS_PLACEHOLDERS[type];
  const found = [...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? '');
  return [...new Set(found.filter((word) => !allowed.includes(word)))];
}

export interface SmsTemplateDto {
  type: SmsTemplateType;
  template: string;
  defaultTemplate: string;
  isCustom: boolean;
  placeholders: readonly string[];
  preview: string;
}

export interface SmsTemplatesDto {
  /** The language used for outgoing SMS (set on the server). */
  locale: Language;
  items: SmsTemplateDto[];
}
