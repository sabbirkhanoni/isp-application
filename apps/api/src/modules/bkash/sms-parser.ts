import {
  normalizeMobile,
  parseAmountToPoisha,
  parseStatementTime,
  type ParsedStatementRow,
} from './statement-parser.js';

/**
 * Reads the "you have received payment" SMS that bKash sends to the merchant number, e.g.
 *   You have received payment Tk 500.00 from 01711223344. Fee Tk 0.00. Balance Tk 12,300.00.
 *   TrxID 9G7ABC1234 at 15/11/2026 14:22
 * The wording is matched loosely (only the amount after "received", the TrxID, an optional sender number,
 * time and reference are needed). Anything else, for example OTPs or send-money notices, returns null.
 */
export function parseBkashSms(message: string, receivedAt: Date): ParsedStatementRow | null {
  const text = message.replace(/\s+/g, ' ').trim();
  if (!/\breceived\b/i.test(text)) return null;

  const trx = /TrxID\s*[:-]?\s*([A-Z0-9]{8,12})\b/i.exec(text);
  const amount = /\breceived\b[^0-9]{0,40}?(?:Tk\.?|BDT|৳)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!trx?.[1] || !amount?.[1]) return null;
  const amountPoisha = parseAmountToPoisha(amount[1]);
  if (amountPoisha === null) return null;

  const sender = /\bfrom\s+(\+?(?:88)?01[3-9]\d{8})\b/i.exec(text);
  const when = /\bat\s+(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i.exec(
    text,
  );
  const reference = /\bRef(?:erence)?\s*[:-]?\s*([A-Za-z0-9_-]{2,20})\b/i.exec(text);

  return {
    line: 0,
    trxId: trx[1].toUpperCase(),
    amountPoisha,
    senderPhone: sender?.[1] ? normalizeMobile(sender[1]) : null,
    reference: reference?.[1] ?? null,
    occurredAt: (when?.[1] ? parseStatementTime(when[1]) : null) ?? receivedAt,
  };
}
