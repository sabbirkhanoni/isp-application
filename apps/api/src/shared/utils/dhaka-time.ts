/**
 * Calendar helpers for Asia/Dhaka (UTC+6, no daylight saving).
 * "Date-only" values (billing period, due date) are Dates at 00:00 UTC, matching Postgres DATE columns.
 */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DhakaParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
}

export function dhakaParts(instant: Date): DhakaParts {
  const shifted = new Date(instant.getTime() + DHAKA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Today's Dhaka calendar date as a date-only value. */
export function dhakaToday(instant: Date): Date {
  const { year, month, day } = dhakaParts(instant);
  return dateOnly(year, month, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatPeriod(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatDateOnly(date: Date): string {
  return `${formatPeriod(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** "2026-11" -> first day of that month. */
export function periodStart(period: string): Date {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return dateOnly(year, month, 1);
}

export function currentPeriod(instant: Date): string {
  return formatPeriod(dhakaToday(instant));
}

/** True when the Dhaka local time is inside [startHour, endHour). */
export function isWithinHours(instant: Date, startHour: number, endHour: number): boolean {
  const { hour } = dhakaParts(instant);
  return hour >= startHour && hour < endHour;
}

/** First instant of the Dhaka calendar month containing `instant`, as UTC. */
export function startOfDhakaMonthUtc(instant: Date): Date {
  const { year, month } = dhakaParts(instant);
  return new Date(Date.UTC(year, month - 1, 1) - DHAKA_OFFSET_MS);
}
