import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatMoney } from './format.js';

describe('format', () => {
  it('formats poisha as taka', () => {
    expect(formatMoney(150000, 'en')).toBe('৳1,500');
    expect(formatMoney(150050, 'en')).toBe('৳1,500.50');
    expect(formatMoney(0, 'en')).toBe('৳0');
  });

  it('uses Bengali digits for the bn locale', () => {
    expect(formatMoney(150000, 'bn')).toContain('১');
  });

  it('shows dates in Asia/Dhaka, not UTC', () => {
    // 20:00 UTC on the 31st is already the 1st in Dhaka (UTC+6).
    expect(formatDate('2026-12-31T20:00:00Z', 'en')).toContain('01');
    expect(formatDate('2026-12-31T20:00:00Z', 'en')).toContain('2027');
  });
});

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1_500)).toBe('1.5 KB');
    expect(formatBytes(2_340_000_000)).toBe('2.3 GB');
    expect(formatBytes(512_000_000_000)).toBe('512 GB');
  });
});
