import { describe, expect, it } from 'vitest';
import { bn } from './bn.js';
import { en } from './en.js';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Object.values(value as object).flatMap(leaves);
}

describe('dictionaries', () => {
  it('have identical keys in English and Bangla', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });

  it('have no empty translations', () => {
    for (const text of [...leaves(en), ...leaves(bn)]) expect(text.trim()).not.toBe('');
  });
});
