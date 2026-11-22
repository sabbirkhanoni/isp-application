import { describe, expect, it } from 'vitest';
import { paymentReceivedText, reminderText, takaText } from './sms-templates.js';

describe('sms templates', () => {
  it('formats poisha as taka text', () => {
    expect(takaText(150000n)).toBe('1500');
    expect(takaText(150050n)).toBe('1500.50');
    expect(takaText(5n)).toBe('0.05');
  });
  it('fills reminder and payment messages in both languages', () => {
    expect(reminderText('bn', { name: 'করিম', amountDue: '500', dueDate: '10 নভেম্বর' })).toContain(
      '500',
    );
    expect(
      paymentReceivedText('en', {
        name: 'Karim',
        amount: '500',
        receipt: 'R000001',
        remaining: '0',
      }),
    ).toContain('R000001');
  });
});
