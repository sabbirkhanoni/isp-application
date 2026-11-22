import type { SmsType } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import type { DbTransaction } from '../../shared/database/transaction.js';

export interface NewSms {
  type: SmsType;
  customerId: string;
  invoiceId?: string | undefined;
  paymentId?: string | undefined;
  phone: string;
  body: string;
  scheduledFor: Date;
}

/**
 * Queues messages. Duplicates for the same (invoice, type) or (payment, type) are silently ignored by the
 * database (partial unique indexes), so re-running a job can never create a second SMS.
 */
export async function enqueueSms(
  db: Database | DbTransaction,
  messages: NewSms[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const result = await db.smsMessage.createMany({
    data: messages.map((m) => ({
      type: m.type,
      customerId: m.customerId,
      invoiceId: m.invoiceId ?? null,
      paymentId: m.paymentId ?? null,
      phone: m.phone,
      body: m.body,
      scheduledFor: m.scheduledFor,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export const MAX_SMS_ATTEMPTS = 5;

export class NotificationRepository {
  constructor(private readonly db: Database) {}

  /** Unpaid invoices that fall due on `dueDate` (date-only) for customers who accept SMS. */
  findInvoicesDueOn(dueDate: Date) {
    return this.db.invoice.findMany({
      where: {
        dueDate,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        customer: { smsOptOut: false, status: { not: 'TERMINATED' } },
      },
      include: { customer: { select: { id: true, fullName: true, phone: true } } },
    });
  }

  enqueue(messages: NewSms[]): Promise<number> {
    return enqueueSms(this.db, messages);
  }

  findDue(now: Date, limit: number) {
    return this.db.smsMessage.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: now } },
      include: { invoice: { select: { status: true } }, payment: { select: { status: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  countSentSince(since: Date): Promise<number> {
    return this.db.smsMessage.count({ where: { status: 'SENT', sentAt: { gte: since } } });
  }

  markSent(id: string, now: Date) {
    return this.db.smsMessage.update({
      where: { id },
      data: { status: 'SENT', sentAt: now, attempts: { increment: 1 }, lastError: null },
    });
  }

  markCancelled(id: string) {
    return this.db.smsMessage.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async markFailed(id: string, error: string) {
    const updated = await this.db.smsMessage.update({
      where: { id },
      data: { attempts: { increment: 1 }, lastError: error.slice(0, 300) },
    });
    if (updated.attempts >= MAX_SMS_ATTEMPTS) {
      await this.db.smsMessage.update({ where: { id }, data: { status: 'FAILED' } });
    }
  }
}
