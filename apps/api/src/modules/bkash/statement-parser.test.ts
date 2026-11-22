import { describe, expect, it } from 'vitest';
import {
  StatementFormatError,
  normalizeMobile,
  parseAmountToPoisha,
  parseStatement,
  parseStatementTime,
} from './statement-parser.js';
import { parseCsv } from '../../shared/utils/csv-reader.js';

describe('csv', () => {
  it('handles quotes, commas, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv(String.fromCharCode(0xfeff) + 'a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ]);
  });
});

describe('amount and time', () => {
  it('parses amounts to poisha', () => {
    expect(parseAmountToPoisha('1,500.50')).toBe(150050n);
    expect(parseAmountToPoisha('500')).toBe(50000n);
    expect(parseAmountToPoisha('৳ 500.5')).toBe(50050n);
    expect(parseAmountToPoisha('0')).toBeNull();
    expect(parseAmountToPoisha('-5')).toBeNull();
    expect(parseAmountToPoisha('12.345')).toBeNull();
    expect(parseAmountToPoisha('abc')).toBeNull();
  });

  it('reads Dhaka local times in several formats', () => {
    expect(parseStatementTime('13/11/2026 10:30:00')?.toISOString()).toBe(
      '2026-11-13T04:30:00.000Z',
    );
    expect(parseStatementTime('2026-11-13 10:30')?.toISOString()).toBe('2026-11-13T04:30:00.000Z');
    expect(parseStatementTime('13-11-2026 10:30 PM')?.toISOString()).toBe(
      '2026-11-13T16:30:00.000Z',
    );
    expect(parseStatementTime('2026-11-13T04:30:00Z')?.toISOString()).toBe(
      '2026-11-13T04:30:00.000Z',
    );
    expect(parseStatementTime('13/11/2026')?.toISOString()).toBe('2026-11-12T18:00:00.000Z');
    expect(parseStatementTime('yesterday')).toBeNull();
    expect(parseStatementTime('32/13/2026 10:00')).toBeNull();
  });

  it('normalises mobile numbers and rejects masked ones', () => {
    expect(normalizeMobile('+8801711223344')).toBe('01711223344');
    expect(normalizeMobile('8801711223344')).toBe('01711223344');
    expect(normalizeMobile('01711***344')).toBeNull();
  });
});

describe('statement', () => {
  const header = 'TrxID,Date,Sender,Reference,Amount,Status';

  it('reads valid rows and reports problems without failing the whole file', () => {
    const csv = [
      header,
      'ABC12345XY,13/11/2026 10:30:00,01711223344,C00001,"1,500.00",Completed',
      'BAD,13/11/2026 10:31:00,01711223344,C00002,500,Completed',
      'DEF12345XY,13/11/2026 10:32:00,01811223344,,0,Completed',
      'GHI12345XY,13/11/2026 10:33:00,01811223344,C00003,500,Failed',
      'JKL12345XY,garbage,01811223344,C00004,500,Completed',
    ].join('\n');
    const result = parseStatement(csv);
    expect(result.totalRows).toBe(5);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      trxId: 'ABC12345XY',
      amountPoisha: 150000n,
      reference: 'C00001',
      senderPhone: '01711223344',
    });
    expect(result.problems.map((p) => p.line)).toEqual([3, 4, 5, 6]);
  });

  it('skips refunds/withdrawals by type', () => {
    const csv =
      'Transaction ID,Transaction Type,Completed Time,Credit\nAAA11111BB,Refund,13/11/2026 10:00,500\nCCC11111DD,Payment,13/11/2026 10:00,500';
    const result = parseStatement(csv);
    expect(result.rows.map((r) => r.trxId)).toEqual(['CCC11111DD']);
  });

  it('supports semicolon files and tells exactly what is missing', () => {
    const ok = parseStatement('TrxID;Date;Amount\nAAA11111BB;2026-11-13 10:00;500');
    expect(ok.rows).toHaveLength(1);
    expect(() => parseStatement('Foo,Bar\n1,2')).toThrow(StatementFormatError);
    expect(() => parseStatement('Foo,Bar\n1,2')).toThrow(/trxId.*time.*amount|Missing/);
  });
});
