import { describe, expect, it } from 'vitest';
import { parseBkashSms } from './sms-parser.js';

const NOW = new Date('2026-11-15T10:00:00Z');

describe('parseBkashSms', () => {
  it('reads amount, sender, transaction ID and time', () => {
    const row = parseBkashSms(
      'You have received payment Tk 1,500.50 from 01711223344. Fee Tk 0.00. Balance Tk 12,300.00. TrxID 9g7abc1234 at 15/11/2026 14:22',
      NOW,
    );
    expect(row).toMatchObject({
      trxId: '9G7ABC1234',
      amountPoisha: 150050n,
      senderPhone: '01711223344',
      reference: null,
    });
    expect(row?.occurredAt.toISOString()).toBe('2026-11-15T08:22:00.000Z'); // 14:22 Dhaka
  });

  it('accepts a +880 sender and a customer reference', () => {
    const row = parseBkashSms(
      'You have received Payment Tk 500 from +8801811223344. Ref C00012. TrxID ABCD123456 at 01/11/2026 09:05 PM',
      NOW,
    );
    expect(row).toMatchObject({
      senderPhone: '01811223344',
      reference: 'C00012',
      amountPoisha: 50000n,
    });
    expect(row?.occurredAt.toISOString()).toBe('2026-11-01T15:05:00.000Z');
  });

  it('falls back to the arrival time when the SMS has no time', () => {
    const row = parseBkashSms(
      'You have received Tk 200.00 from 01711223344. TrxID ZZZZ123456',
      NOW,
    );
    expect(row?.occurredAt).toEqual(NOW);
  });

  it('ignores messages that are not incoming payments', () => {
    expect(parseBkashSms('Your bKash verification code is 123456', NOW)).toBeNull();
    expect(
      parseBkashSms('You have sent Tk 500.00 to 01711223344. TrxID ABCD123456', NOW),
    ).toBeNull();
    expect(parseBkashSms('You have received a gift. TrxID ABCD123456', NOW)).toBeNull();
  });
});
