import { describe, expect, it } from 'vitest';
import {
  currentPeriod,
  dhakaToday,
  formatDateOnly,
  isWithinHours,
  periodStart,
  startOfDhakaMonthUtc,
} from './dhaka-time.js';

describe('dhaka-time', () => {
  it('rolls over to the next Dhaka day at 18:00 UTC', () => {
    expect(formatDateOnly(dhakaToday(new Date('2026-11-30T17:59:00Z')))).toBe('2026-11-30');
    expect(formatDateOnly(dhakaToday(new Date('2026-11-30T18:00:00Z')))).toBe('2026-12-01');
    expect(currentPeriod(new Date('2026-11-30T19:00:00Z'))).toBe('2026-12');
  });

  it('knows the sending window in local time', () => {
    expect(isWithinHours(new Date('2026-11-10T01:59:00Z'), 8, 21)).toBe(false); // 07:59
    expect(isWithinHours(new Date('2026-11-10T02:00:00Z'), 8, 21)).toBe(true); // 08:00
    expect(isWithinHours(new Date('2026-11-10T14:59:00Z'), 8, 21)).toBe(true); // 20:59
    expect(isWithinHours(new Date('2026-11-10T15:00:00Z'), 8, 21)).toBe(false); // 21:00
  });

  it('parses periods and finds the month start in UTC', () => {
    expect(formatDateOnly(periodStart('2026-02'))).toBe('2026-02-01');
    expect(startOfDhakaMonthUtc(new Date('2026-11-15T00:00:00Z')).toISOString()).toBe(
      '2026-10-31T18:00:00.000Z',
    );
  });
});
