import type { AuditLogDto, ListAuditQuery, PaginationMeta } from '@isp/contracts';
import type { AuditRepository } from './audit.repository.js';
import type { AuditEntry, AuditRecorder } from './audit.types.js';

export class AuditService implements AuditRecorder {
  constructor(private readonly repository: AuditRepository) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.repository.insert(entry);
  }

  async list(query: ListAuditQuery): Promise<{ items: AuditLogDto[]; pagination: PaginationMeta }> {
    const { items, total } = await this.repository.list(query);
    return {
      items: items.map((row) => ({
        id: row.id,
        action: row.action,
        outcome: row.outcome,
        actorUsername: row.actor?.username ?? null,
        targetType: row.targetType,
        targetId: row.targetId,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
        details:
          row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : null,
      })),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }
}
