import type { Language } from '@isp/contracts';
import type { Logger } from '../../shared/logger/logger.js';
import type { Clock } from '../../shared/utils/clock.js';
import {
  addDays,
  dhakaToday,
  isWithinHours,
  startOfDhakaMonthUtc,
} from '../../shared/utils/dhaka-time.js';
import type { NotificationRepository } from './notifications.repository.js';
import type { SmsTemplateStore } from './sms-template.store.js';
import type { SmsSender } from './sms-sender.js';
import { reminderText, takaText } from './sms-templates.js';

/** Messages go out only between 08:00 and 21:00 Dhaka time so nobody is woken up by a bill reminder. */
export const SEND_WINDOW = { startHour: 8, endHour: 21 } as const;
const BATCH_SIZE = 100;
const REMINDERS = [
  { type: 'REMINDER_D2', daysBefore: 2 },
  { type: 'REMINDER_D1', daysBefore: 1 },
] as const;

export interface DispatchResult {
  sent: number;
  failed: number;
  cancelled: number;
  skippedReason?: 'outside-window' | 'monthly-cap';
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly templates: SmsTemplateStore,
    private readonly sender: SmsSender,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly options: { locale: Language; monthlyCap: number },
  ) {}

  /** Queues the "2 days before" and "1 day before" reminders for today's date. Safe to run repeatedly. */
  async enqueueReminders(): Promise<number> {
    const now = this.clock.now();
    const today = dhakaToday(now);
    const custom = (await this.templates.customFor(this.options.locale)).reminder;
    let queued = 0;
    for (const { type, daysBefore } of REMINDERS) {
      const dueDate = addDays(today, daysBefore);
      const invoices = await this.repo.findInvoicesDueOn(dueDate);
      queued += await this.repo.enqueue(
        invoices.map((invoice) => ({
          type,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          phone: invoice.customer.phone,
          scheduledFor: now,
          body: reminderText(
            this.options.locale,
            {
              name: invoice.customer.fullName,
              amountDue: takaText(invoice.amountPoisha - invoice.paidPoisha),
              dueDate: new Intl.DateTimeFormat(this.options.locale === 'bn' ? 'bn-BD' : 'en-GB', {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'long',
              }).format(dueDate),
            },
            custom,
          ),
        })),
      );
    }
    return queued;
  }

  /** Sends due messages while respecting the send window and the monthly budget. */
  async dispatchPending(): Promise<DispatchResult> {
    const now = this.clock.now();
    const result: DispatchResult = { sent: 0, failed: 0, cancelled: 0 };
    if (!isWithinHours(now, SEND_WINDOW.startHour, SEND_WINDOW.endHour)) {
      return { ...result, skippedReason: 'outside-window' };
    }

    let budget =
      this.options.monthlyCap - (await this.repo.countSentSince(startOfDhakaMonthUtc(now)));
    if (budget <= 0) {
      this.logger.warn(
        { cap: this.options.monthlyCap },
        'Monthly SMS cap reached; messages stay queued',
      );
      return { ...result, skippedReason: 'monthly-cap' };
    }

    const due = await this.repo.findDue(now, Math.min(BATCH_SIZE, budget));
    for (const message of due) {
      if (budget <= 0) break;
      const stale =
        (message.type !== 'PAYMENT_RECEIVED' &&
          message.invoice &&
          message.invoice.status !== 'ISSUED' &&
          message.invoice.status !== 'PARTIALLY_PAID') ||
        (message.type === 'PAYMENT_RECEIVED' && message.payment?.status === 'REVERSED');
      if (stale) {
        await this.repo.markCancelled(message.id);
        result.cancelled += 1;
        continue;
      }
      try {
        await this.sender.send(message.phone, message.body);
        await this.repo.markSent(message.id, this.clock.now());
        result.sent += 1;
        budget -= 1;
      } catch (error) {
        await this.repo.markFailed(
          message.id,
          error instanceof Error ? error.message : 'unknown error',
        );
        result.failed += 1;
        this.logger.warn({ smsId: message.id }, 'SMS delivery failed; will retry');
      }
    }
    return result;
  }
}
