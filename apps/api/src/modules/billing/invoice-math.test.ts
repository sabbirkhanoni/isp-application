import { describe, expect, it } from 'vitest';
import { buildInvoiceLines, daysInMonth, invoiceStatusFor, prorate } from './invoice-math.js';

describe('invoiceStatusFor', () => {
  it('maps paid amounts to statuses', () => {
    expect(invoiceStatusFor(50000n, 0n)).toBe('ISSUED');
    expect(invoiceStatusFor(50000n, 1n)).toBe('PARTIALLY_PAID');
    expect(invoiceStatusFor(50000n, 50000n)).toBe('PAID');
  });
  it('treats a zero-priced invoice as paid', () => {
    expect(invoiceStatusFor(0n, 0n)).toBe('PAID');
  });
});

const NOV = new Date(Date.UTC(2026, 10, 1));
const base = {
  packageName: 'Home 10',
  price: 50000n,
  discount: 0n,
  discountNote: null,
  periodStart: NOV,
  joinedOn: null,
  prorateNewCustomers: false,
  charges: [],
};

describe('buildInvoiceLines', () => {
  it('counts days and prorates down to whole poisha', () => {
    expect(daysInMonth(NOV)).toBe(30);
    expect(daysInMonth(new Date(Date.UTC(2028, 1, 1)))).toBe(29);
    expect(prorate(50000n, 16, 30)).toBe(26666n);
  });

  it('bills the plain price when nothing else applies', () => {
    const built = buildInvoiceLines(base);
    expect(built.total).toBe(50000n);
    expect(built.lines).toEqual([
      { kind: 'PACKAGE', description: 'Home 10', amountPoisha: 50000n },
    ]);
  });

  it('applies the standing discount but never below zero', () => {
    expect(buildInvoiceLines({ ...base, discount: 10000n }).total).toBe(40000n);
    expect(buildInvoiceLines({ ...base, discount: 90000n }).total).toBe(0n);
  });

  it('prorates only new customers of this month, and only when switched on', () => {
    const joined = new Date(Date.UTC(2026, 10, 15));
    const on = buildInvoiceLines({ ...base, joinedOn: joined, prorateNewCustomers: true });
    expect(on.total).toBe(26666n); // 16 of 30 days
    expect(on.lines[0]?.kind).toBe('PRORATION');
    expect(buildInvoiceLines({ ...base, joinedOn: joined }).total).toBe(50000n);
    const first = new Date(Date.UTC(2026, 10, 1));
    expect(buildInvoiceLines({ ...base, joinedOn: first, prorateNewCustomers: true }).total).toBe(
      50000n,
    );
    const older = new Date(Date.UTC(2026, 9, 15));
    expect(buildInvoiceLines({ ...base, joinedOn: older, prorateNewCustomers: true }).total).toBe(
      50000n,
    );
  });

  it('adds one-time charges and trims a discount that is larger than the bill', () => {
    const built = buildInvoiceLines({
      ...base,
      charges: [
        { id: 'a', description: 'Connection fee', amountPoisha: 100000n },
        { id: 'b', description: 'Waiver', amountPoisha: -400000n },
      ],
    });
    expect(built.total).toBe(0n);
    expect(built.billed).toEqual([
      { id: 'a', amountPoisha: 100000n },
      { id: 'b', amountPoisha: -150000n },
    ]);
    expect(built.carryForward).toEqual([{ description: 'Waiver', amountPoisha: -250000n }]);
  });
});
