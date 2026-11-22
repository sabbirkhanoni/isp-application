import type { Language } from '@isp/contracts';

const TIME_ZONE = 'Asia/Dhaka';
const LOCALES: Record<Language, string> = { bn: 'bn-BD', en: 'en-BD' };

/** Money is stored as integer poisha; 100 poisha = 1 BDT. */
export function formatMoney(poisha: number, language: Language): string {
  const taka = poisha / 100;
  const number = new Intl.NumberFormat(LOCALES[language], {
    minimumFractionDigits: Number.isInteger(taka) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(taka);
  return `৳${number}`;
}

export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Data amounts for traffic usage, in decimal units like ISP plans use (1 GB = 1,000,000,000 bytes). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unit]}`;
}
