import {
  BROADCAST_MAX_RECIPIENTS,
  type BroadcastInput,
  type BroadcastPreviewDto,
  type BroadcastResultDto,
} from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import { ValidationError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { enqueueSms } from './notifications.repository.js';

const personalise = (message: string, name: string) => message.replaceAll('{name}', name);

/**
 * One-off messages the owner writes (outage notice, holiday hours, new package...). Messages are queued like
 * every other SMS, so the send window (08:00-21:00) and the monthly cap still apply, and customers who
 * opted out of SMS are never included.
 */
export class BroadcastService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  private where(
    audience: BroadcastInput['audience'],
    optedOut: boolean,
  ): Prisma.CustomerWhereInput {
    return {
      smsOptOut: optedOut,
      status: audience.status === 'ALL' ? { in: ['ACTIVE', 'SUSPENDED'] } : audience.status,
      ...(audience.area ? { area: { equals: audience.area, mode: 'insensitive' as const } } : {}),
      ...(audience.routerId ? { subscription: { routerId: audience.routerId } } : {}),
      ...(audience.onlyWithDues
        ? { invoices: { some: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] as const } } } }
        : {}),
    };
  }

  async preview(input: BroadcastInput): Promise<BroadcastPreviewDto> {
    const recipients = await this.db.customer.count({ where: this.where(input.audience, false) });
    const optedOut = await this.db.customer.count({ where: this.where(input.audience, true) });
    const areas = await this.db.customer.findMany({
      where: { area: { not: null }, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      distinct: ['area'],
      select: { area: true },
      orderBy: { area: 'asc' },
      take: 200,
    });
    return {
      recipients,
      optedOut,
      tooMany: recipients > BROADCAST_MAX_RECIPIENTS,
      sample: personalise(input.message, 'Karim'),
      areas: areas.map((a) => a.area).filter((a): a is string => a !== null),
    };
  }

  async send(
    actor: AuthContext,
    input: BroadcastInput,
    ctx: RequestContext,
  ): Promise<BroadcastResultDto> {
    const customers = await this.db.customer.findMany({
      where: this.where(input.audience, false),
      select: { id: true, fullName: true, phone: true },
      take: BROADCAST_MAX_RECIPIENTS + 1,
    });
    if (customers.length === 0) {
      throw new ValidationError('No customers match this selection.', [
        { path: 'audience', message: 'No customers match this selection.' },
      ]);
    }
    if (customers.length > BROADCAST_MAX_RECIPIENTS) {
      throw new ValidationError('Too many recipients.', [
        { path: 'audience', message: `Select at most ${BROADCAST_MAX_RECIPIENTS} customers.` },
      ]);
    }
    const now = this.clock.now();
    const queued = await enqueueSms(
      this.db,
      customers.map((c) => ({
        type: 'BULK' as const,
        customerId: c.id,
        phone: c.phone,
        body: personalise(input.message, c.fullName),
        scheduledFor: now,
      })),
    );
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.SMS_BROADCAST_QUEUED,
      targetType: 'sms_broadcast',
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { recipients: queued, audience: input.audience, message: input.message },
    });
    return { queued };
  }
}
