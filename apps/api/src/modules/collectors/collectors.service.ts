import type {
  AssignCollectorInput,
  AssignedCollectorRowDto,
  CollectorOverviewDto,
  SetTargetInput,
} from '@isp/contracts';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { currentPeriod, periodStart, startOfDhakaMonthUtc } from '../../shared/utils/dhaka-time.js';
import { AUDIT_ACTIONS, type AuditAction, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { CollectorsRepository } from './collectors.repository.js';

const toMap = (rows: Array<{ collector: string | null; total: bigint | null }>) =>
  new Map(rows.map((r) => [r.collector ?? '', Number(r.total ?? 0n)]));

/**
 * "Collector" here means the staff member responsible for a group of customers (usually an area),
 * not whoever typed in a payment. Each has a monthly collection target.
 */
export class CollectorsService {
  constructor(
    private readonly repo: CollectorsRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async overview(period = currentPeriod(this.clock.now())): Promise<CollectorOverviewDto> {
    const first = periodStart(period);
    const from = startOfDhakaMonthUtc(first);
    const to = startOfDhakaMonthUtc(
      new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)),
    );
    const [users, counts, billed, collected, owed, targets, areas] = await Promise.all([
      this.repo.activeUsers(),
      this.repo.customerCounts().then(toMap),
      this.repo.billed(first).then(toMap),
      this.repo.collected(from, to).then(toMap),
      this.repo.outstanding().then(toMap),
      this.repo.targets(first),
      this.repo.areas(),
    ]);
    const row = (userId: string | null, name: string): AssignedCollectorRowDto => {
      const key = userId ?? '';
      return {
        userId,
        name,
        customers: counts.get(key) ?? 0,
        billedPoisha: billed.get(key) ?? 0,
        collectedPoisha: collected.get(key) ?? 0,
        outstandingPoisha: owed.get(key) ?? 0,
        targetPoisha: userId ? (targets.get(userId) ?? null) : null,
      };
    };
    const rows = users
      .map((u) => row(u.id, u.fullName))
      .filter((r) => r.customers > 0 || r.targetPoisha !== null);
    const unassigned = row(null, '');
    if (unassigned.customers > 0) rows.push(unassigned);
    return { period, rows, users: users.map((u) => ({ id: u.id, name: u.fullName })), areas };
  }

  /** The signed-in person's own row, for the "my collection" card. */
  async mine(userId: string, period?: string): Promise<AssignedCollectorRowDto | null> {
    const { rows } = await this.overview(period);
    return rows.find((r) => r.userId === userId) ?? null;
  }

  async setTarget(actor: AuthContext, input: SetTargetInput, ctx: RequestContext): Promise<void> {
    if (!(await this.repo.isActiveUser(input.userId))) throw new NotFoundError('User not found.');
    await this.repo.setTarget(input.userId, periodStart(input.period), input.targetPoisha);
    await this.record(actor, ctx, AUDIT_ACTIONS.COLLECTION_TARGET_SET, input.userId, { ...input });
  }

  async assign(
    actor: AuthContext,
    input: AssignCollectorInput,
    ctx: RequestContext,
  ): Promise<{ updated: number }> {
    if (input.collectorId && !(await this.repo.isActiveUser(input.collectorId))) {
      throw new ValidationError('Collector not found.', [
        { path: 'collectorId', message: 'Choose an active staff member.' },
      ]);
    }
    const updated = input.area
      ? await this.repo.assignByArea(input.collectorId, input.area)
      : await this.repo.assignByCodes(input.collectorId, input.customerCodes ?? []);
    await this.record(actor, ctx, AUDIT_ACTIONS.COLLECTOR_ASSIGNED, input.collectorId ?? 'none', {
      area: input.area ?? null,
      customerCodes: input.customerCodes?.length ?? 0,
      updated,
    });
    return { updated };
  }

  private record(
    actor: AuthContext,
    ctx: RequestContext,
    action: AuditAction,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'collector',
      targetId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}
