import type { Language, SmsTemplateType } from '@isp/contracts';

export interface ReminderVars {
  name: string;
  amountDue: string;
  dueDate: string;
}
export interface PaymentVars {
  name: string;
  amount: string;
  receipt: string;
  remaining: string;
}

/**
 * Built-in message texts with {placeholders}. Kept short: Bangla (Unicode) SMS fits ~70 characters per
 * segment, so every extra word costs money. The admin can replace them from the settings screen.
 */
export const DEFAULT_TEMPLATES: Readonly<Record<Language, Record<SmsTemplateType, string>>> = {
  bn: {
    reminder: '{name}, আপনার ইন্টারনেট বিল {amountDue} টাকা {dueDate} তারিখের মধ্যে পরিশোধ করুন।',
    paymentReceived:
      '{name}, {amount} টাকা পেয়েছি। রসিদ {receipt}। বাকি {remaining} টাকা। ধন্যবাদ।',
  },
  en: {
    reminder: '{name}, your internet bill of Tk {amountDue} is due by {dueDate}.',
    paymentReceived:
      '{name}, received Tk {amount}. Receipt {receipt}. Remaining Tk {remaining}. Thank you.',
  },
};

/** Fills {placeholders}; a word that has no value is left visible so mistakes are noticed, not hidden. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^{}]*)\}/g, (whole, key: string) => vars[key] ?? whole);
}

export function reminderText(locale: Language, vars: ReminderVars, custom?: string | null): string {
  return renderTemplate(custom ?? DEFAULT_TEMPLATES[locale].reminder, { ...vars });
}

export function paymentReceivedText(
  locale: Language,
  vars: PaymentVars,
  custom?: string | null,
): string {
  return renderTemplate(custom ?? DEFAULT_TEMPLATES[locale].paymentReceived, { ...vars });
}

/** 150000 poisha -> "1500" (whole taka) or "1500.50". */
export function takaText(poisha: bigint): string {
  const taka = poisha / 100n;
  const rest = poisha % 100n;
  return rest === 0n ? taka.toString() : `${taka}.${rest.toString().padStart(2, '0')}`;
}
