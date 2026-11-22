/**
 * Reads a bKash merchant statement exported as CSV.
 *
 * The exact column names are not confirmed yet (bKash has not answered), so the parser recognises common
 * header names case-insensitively and reports clearly which required column is missing. If the real export
 * uses other names, add them to HEADER_ALIASES — nothing else needs to change.
 */
import {
  detectDelimiter,
  normalizeHeader,
  parseCsv,
  stripBom,
} from '../../shared/utils/csv-reader.js';

export interface ParsedStatementRow {
  line: number;
  trxId: string;
  amountPoisha: bigint;
  senderPhone: string | null;
  reference: string | null;
  occurredAt: Date;
}

export interface RowProblem {
  line: number;
  message: string;
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  problems: RowProblem[];
  /** Number of data rows seen (valid + invalid), excluding the header and blank lines. */
  totalRows: number;
}

export class StatementFormatError extends Error {}

const HEADER_ALIASES = {
  trxId: [
    'trxid',
    'trx id',
    'transaction id',
    'transactionid',
    'txn id',
    'transaction no',
    'trx no',
  ],
  amount: ['amount', 'credit', 'credit amount', 'received amount', 'amount (bdt)', 'amount(bdt)'],
  debit: ['debit', 'debit amount', 'withdrawn'],
  sender: [
    'sender',
    'sender number',
    'counterparty',
    'customer number',
    'customer msisdn',
    'from',
    'wallet number',
    'msisdn',
    'sender wallet',
  ],
  reference: [
    'reference',
    'ref',
    'reference no',
    'customer reference',
    'invoice no',
    'note',
    'purpose',
  ],
  time: [
    'date',
    'date time',
    'datetime',
    'time',
    'completed time',
    'transaction time',
    'transaction date',
    'timestamp',
  ],
  status: ['status', 'transaction status'],
  type: ['type', 'transaction type', 'trx type', 'txn type'],
} as const;

type Field = keyof typeof HEADER_ALIASES;
const REQUIRED: Field[] = ['trxId', 'time'];
/** Rows of these kinds are money going out or being returned — never credited to a customer. */
const NON_INCOMING_TYPE = /refund|reversal|withdraw|settle|cash.?out|disburse|payout|transfer out/i;

function mapHeaders(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (map[field] === undefined && (HEADER_ALIASES[field] as readonly string[]).includes(name)) {
        map[field] = index;
      }
    }
  });
  return map;
}

/** "1,500.50" -> 150050n. Returns null when not a plain positive decimal with at most 2 decimals. */
export function parseAmountToPoisha(raw: string): bigint | null {
  const cleaned = raw.replace(/[,\s৳]|tk|bdt/gi, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const poisha = BigInt(match[1] as string) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return poisha > 0n ? poisha : null;
}

/** Accepts ISO or DD/MM/YYYY[ HH:mm[:ss][ AM|PM]]; values without a zone are Dhaka local time (UTC+6). */
export function parseStatementTime(raw: string): Date | null {
  const text = raw.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  let year: number, month: number, day: number;
  let rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]*(.*)$/.exec(text);
  if (m) {
    [year, month, day, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''];
  } else {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*(.*)$/.exec(text);
    if (!m) return null;
    [day, month, year, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''];
  }
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(rest.trim());
  if (rest.trim() !== '' && !t) return null;
  let hour = t ? Number(t[1]) : 0;
  const minute = t ? Number(t[2]) : 0;
  const second = t?.[3] ? Number(t[3]) : 0;
  if (t?.[4]) hour = (hour % 12) + (t[4].toUpperCase() === 'PM' ? 12 : 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - 6 * 60 * 60 * 1000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 8801XXXXXXXXX, +8801XXXXXXXXX, 01XXXXXXXXX -> 01XXXXXXXXX; anything else (masked numbers etc.) -> null. */
export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/[\s()+-]/g, '');
  const match = /^(?:88)?(01[3-9]\d{8})$/.exec(digits);
  return match ? (match[1] as string) : null;
}

export function parseStatement(text: string): ParsedStatement {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  const table = parseCsv(text, detectDelimiter(firstLine));
  const header = table[0];
  if (!header) throw new StatementFormatError('The file is empty.');

  const columns = mapHeaders(header);
  const missing = REQUIRED.filter((f) => columns[f] === undefined);
  if (columns.amount === undefined) missing.push('amount');
  if (missing.length > 0) {
    throw new StatementFormatError(
      `Missing column(s): ${missing.join(', ')}. Found: ${header.map((h) => h.trim()).join(', ')}`,
    );
  }

  const rows: ParsedStatementRow[] = [];
  const problems: RowProblem[] = [];
  const cell = (row: string[], field: Field): string =>
    columns[field] === undefined ? '' : (row[columns[field] as number] ?? '').trim();

  table.slice(1).forEach((row, index) => {
    const line = index + 2;
    const type = cell(row, 'type');
    const status = cell(row, 'status');
    if (type && NON_INCOMING_TYPE.test(type)) {
      problems.push({ line, message: `skipped: "${type}" is not an incoming payment` });
      return;
    }
    if (status && !/^(completed|success|successful)$/i.test(status)) {
      problems.push({ line, message: `skipped: status is "${status}"` });
      return;
    }
    const trxId = cell(row, 'trxId').toUpperCase();
    if (!/^[A-Z0-9]{8,12}$/.test(trxId)) {
      problems.push({ line, message: 'transaction ID is missing or not valid' });
      return;
    }
    const amount = parseAmountToPoisha(cell(row, 'amount'));
    if (amount === null) {
      const debit = cell(row, 'debit');
      problems.push({
        line,
        message: debit ? 'skipped: debit row' : 'amount is not a positive number',
      });
      return;
    }
    const occurredAt = parseStatementTime(cell(row, 'time'));
    if (!occurredAt) {
      problems.push({ line, message: 'date/time not understood' });
      return;
    }
    rows.push({
      line,
      trxId,
      amountPoisha: amount,
      senderPhone: normalizeMobile(cell(row, 'sender')),
      reference: cell(row, 'reference') || null,
      occurredAt,
    });
  });

  return { rows, problems, totalRows: table.length - 1 };
}
