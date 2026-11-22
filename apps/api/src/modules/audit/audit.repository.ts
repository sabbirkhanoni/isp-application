import type { ListAuditQuery } from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import type { AuditEntry } from './audit.types.js';

const LOGIN_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGED',
];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Dates typed by the admin are Dhaka calendar days (UTC+6). */
const dhakaDayStart = (day: string) => new Date(`${day}T00:00:00+06:00`);

export class AuditRepository {
  constructor(private readonly db: Database) {}

  async insert(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        outcome: entry.outcome,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ?? null,
        metadata: entry.metadata as Prisma.InputJsonObject | undefined,
      },
    });
  }

  async list(query: ListAuditQuery) {
    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = dhakaDayStart(query.from);
    if (query.to) created.lt = new Date(dhakaDayStart(query.to).getTime() + DAY_MS);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.group === 'logins' ? { action: { in: LOGIN_ACTIONS } } : {}),
      ...(query.group === 'denied' ? { outcome: 'DENIED' } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to ? { createdAt: created } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        include: { actor: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
