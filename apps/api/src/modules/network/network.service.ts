import type {
  AgentJobDto,
  AgentJobResultInput,
  AgentSessionsInput,
  LineDto,
  LineSummary,
  RouterFixResultDto,
  RouterSyncReportDto,
  ListLinesQuery,
  ListNetworkJobsQuery,
  NetworkJobDto,
  PaginationMeta,
} from '@isp/contracts';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logger/logger.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toCsv } from '../reports/csv.js';
import { toLineDto, toNetworkJobDto } from './network.mapper.js';
import type { NetworkRepository, SessionRow } from './network.repository.js';
import { desiredStateFor } from './network-queue.js';
import type { LiveSession, RouterGateway } from './router-gateway.js';
import { parseRouterOsUptime, RouterError } from './router-gateway.js';
import type { PppoeCredentials } from './pppoe-credentials.js';
import type { RouterService } from './routers.service.js';

const MAX_ATTEMPTS = 5;
/** The router's account list is re-read at most this often (it can be large). */
const SECRETS_REFRESH_MS = 10 * 60_000;
const BATCH_SIZE = 25;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];

export interface RunSummary {
  done: number;
  retried: number;
  failed: number;
}

export class NetworkService {
  constructor(
    private readonly repo: NetworkRepository,
    private readonly routers: RouterService,
    private readonly gateway: RouterGateway,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly credentials: PppoeCredentials,
  ) {}

  /** Runs due jobs for routers the server reaches directly. Safe to call repeatedly and concurrently. */
  async runDue(): Promise<RunSummary> {
    const summary: RunSummary = { done: 0, retried: 0, failed: 0 };
    const claimed = await this.repo.claimDue('REST', this.clock.now(), BATCH_SIZE);
    for (const job of claimed) {
      const outcome = await this.execute(job.id);
      summary[outcome] += 1;
    }
    return summary;
  }

  /**
   * Reads who is online from every router the server reaches directly. One unreachable router never
   * blocks the others; its previous state is kept and the error is shown on the Routers screen.
   */
  async pollSessions(): Promise<{ polled: number; failed: number }> {
    const routers = await this.repo.listPollableRouters();
    let failed = 0;
    await Promise.all(
      routers.map(async (router) => {
        const now = this.clock.now();
        try {
          const sessions = await this.gateway.listSessions(this.routers.targetOf(router));
          await this.repo.replaceSessions(router.id, this.toRows(sessions, now), now);
          await this.repo.markRouterSeen(router.id, now, null);
          const stale =
            !router.secretsSyncedAt ||
            now.getTime() - router.secretsSyncedAt.getTime() > SECRETS_REFRESH_MS;
          if (stale) {
            await this.repo.replaceSecrets(
              router.id,
              await this.gateway.listSecrets(this.routers.targetOf(router)),
              now,
            );
          }
        } catch (error) {
          failed += 1;
          const message =
            error instanceof RouterError
              ? error.message
              : 'Unexpected error while reading sessions';
          if (!(error instanceof RouterError)) {
            this.logger.error({ err: error, router: router.name }, 'Session poll crashed');
          }
          await this.repo.markRouterSeen(router.id, router.lastSeenAt ?? now, message);
        }
      }),
    );
    return { polled: routers.length - failed, failed };
  }

  /** Sessions reported by an agent (for routers the server cannot reach directly). */
  async agentSessions(routerId: string, input: AgentSessionsInput): Promise<void> {
    const now = this.clock.now();
    const sessions: LiveSession[] = input.sessions.map((s) => ({
      name: s.name,
      address: s.address ?? null,
      callerId: s.callerId ?? null,
      uptime: s.uptime ?? null,
      rxBytes: s.rxBytes ?? null,
      txBytes: s.txBytes ?? null,
    }));
    await this.repo.replaceSessions(routerId, this.toRows(sessions, now), now);
    if (input.secrets) {
      await this.repo.replaceSecrets(
        routerId,
        input.secrets.map((x) => ({
          name: x.name,
          profile: x.profile ?? null,
          disabled: x.disabled,
        })),
        now,
      );
    }
    await this.repo.markRouterSeen(routerId, now, null);
  }

  // ---- compare report (admin) ----
  /** Re-reads the account list now (direct routers only; agent routers report it themselves). */
  async refreshSecrets(routerId: string): Promise<void> {
    const router = await this.repo.findRouter(routerId);
    if (!router) throw new NotFoundError('Router not found.');
    if (router.driver !== 'REST') {
      throw new ValidationError('This router reports through the agent; wait for its next report.');
    }
    try {
      const secrets = await this.gateway.listSecrets(this.routers.targetOf(router));
      await this.repo.replaceSecrets(routerId, secrets, this.clock.now());
    } catch (error) {
      if (error instanceof RouterError) throw new ValidationError(error.message);
      throw error;
    }
  }

  async compare(routerId: string): Promise<RouterSyncReportDto> {
    const [router, report] = await Promise.all([
      this.repo.findRouter(routerId),
      this.repo.compareReport(routerId),
    ]);
    if (!router || !report) throw new NotFoundError('Router not found.');
    return { ...report, routerName: router.name };
  }

  /** Queues a sync for every customer that is missing (and can be created) or differs on this router. */
  async fix(
    actor: AuthContext,
    routerId: string,
    ctx: RequestContext,
  ): Promise<RouterFixResultDto> {
    const report = await this.compare(routerId);
    const ids = new Set<string>([
      ...report.missingOnRouter.filter((c) => c.canCreate).map((c) => c.customerId),
      ...report.mismatches.map((c) => c.customerId),
    ]);
    const queued = await this.repo.queueSyncFor([...ids]);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.ROUTER_FIX_QUEUED,
      targetType: 'router',
      targetId: routerId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { queued },
    });
    return { queued };
  }

  /** Router accounts nobody owns, shaped like the customer-import sheet (admin fills in the blanks). */
  async routerOnlyCsv(routerId: string): Promise<string> {
    const router = await this.repo.findRouter(routerId);
    if (!router) throw new NotFoundError('Router not found.');
    const rows = await this.repo.routerOnlyWithPackage(routerId);
    return toCsv(
      [
        'customer_id',
        'name',
        'phone',
        'address',
        'area',
        'package',
        'connection_type',
        'pppoe_username',
        'router',
        'status',
      ],
      rows.map((r) => [
        '',
        '',
        '',
        '',
        '',
        r.packageName ?? '',
        'PPPOE',
        r.name,
        router.name,
        r.disabled ? 'SUSPENDED' : 'ACTIVE',
      ]),
    );
  }

  /** Admin-only, audited: the password the system created the router account with. */
  async revealPppoePassword(
    actor: AuthContext,
    customerId: string,
    ctx: RequestContext,
  ): Promise<{ password: string | null }> {
    const sealed = await this.repo.passwordOf(customerId);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.PPPOE_PASSWORD_VIEWED,
      targetType: 'customer',
      targetId: customerId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
    return { password: sealed ? this.credentials.reveal(sealed) : null };
  }

  private toRows(sessions: LiveSession[], now: Date): SessionRow[] {
    const unique = new Map<string, SessionRow>();
    for (const s of sessions) {
      const seconds = parseRouterOsUptime(s.uptime);
      unique.set(s.name, {
        name: s.name,
        address: s.address,
        callerId: s.callerId,
        startedAt: seconds === null ? null : new Date(now.getTime() - seconds * 1000),
        rxBytes: s.rxBytes ?? null,
        txBytes: s.txBytes ?? null,
      });
    }
    return [...unique.values()];
  }

  async listLines(
    query: ListLinesQuery,
  ): Promise<{ items: LineDto[]; pagination: PaginationMeta; summary: LineSummary }> {
    const [{ items, total }, summary] = await Promise.all([
      this.repo.listLines(query),
      this.repo.lineCounts(),
    ]);
    return {
      items: items.map(toLineDto),
      pagination: { page: query.page, limit: query.limit, total },
      summary,
    };
  }

  /** null = this customer is not a router-managed PPPoE customer. */
  async lineOf(customerId: string): Promise<LineDto | null> {
    const row = await this.repo.findLine(customerId);
    return row ? toLineDto(row) : null;
  }

  private async execute(jobId: string): Promise<keyof RunSummary> {
    const ctx = await this.repo.loadForExecution(jobId);
    if (!ctx) return 'failed';
    const now = this.clock.now();
    const desired = desiredStateFor(ctx.customerStatus);
    try {
      if (!ctx.pppoeUsername)
        throw new RouterError('SECRET_NOT_FOUND', 'Customer has no PPPoE username', false);
      const applied = await this.gateway.setPppoeEnabled(
        this.routers.targetOf(ctx.router),
        ctx.pppoeUsername,
        desired === 'ENABLED',
        {
          profile: ctx.profile,
          password: ctx.passwordEnc ? this.credentials.reveal(ctx.passwordEnc) : null,
        },
      );
      await this.repo.markDone(jobId, desired, now);
      await this.repo.settlePassword(ctx.customerId, applied.created);
      await this.repo.markRouterSeen(ctx.router.id, now, null);
      return 'done';
    } catch (error) {
      const known = error instanceof RouterError ? error : null;
      const message = known?.message ?? 'Unexpected error while contacting the router';
      if (!known) this.logger.error({ err: error, jobId }, 'Router job crashed');
      const retryable = known?.retryable ?? true;
      const retryAt =
        retryable && ctx.attempts < MAX_ATTEMPTS ? this.retryTime(now, ctx.attempts) : null;
      await this.repo.markFailure(jobId, message, now, retryAt);
      if (known?.code === 'UNREACHABLE' || known?.code === 'AUTH_FAILED') {
        await this.repo.markRouterSeen(ctx.router.id, ctx.router.lastSeenAt ?? now, message);
      }
      return retryAt ? 'retried' : 'failed';
    }
  }

  // ---- agent protocol ----
  async agentClaim(routerId: string): Promise<AgentJobDto[]> {
    const now = this.clock.now();
    await this.repo.markRouterSeen(routerId, now, null);
    const claimed = await this.repo.claimDue('AGENT', now, BATCH_SIZE, routerId);
    const jobs: AgentJobDto[] = [];
    for (const job of claimed) {
      const payload = await this.repo.jobPayload(job.id);
      if (!payload?.pppoeUsername) {
        await this.repo.markFailure(job.id, 'Customer has no PPPoE username', now, null);
        continue;
      }
      const desiredState = desiredStateFor(payload.customerStatus);
      await this.repo.recordAppliedState(job.id, desiredState);
      jobs.push({
        id: job.id,
        pppoeUsername: payload.pppoeUsername,
        desiredState,
        profile: payload.profile,
        password: payload.passwordEnc ? this.credentials.reveal(payload.passwordEnc) : null,
      });
    }
    return jobs;
  }

  async agentReport(routerId: string, jobId: string, result: AgentJobResultInput): Promise<void> {
    const job = await this.repo.findJobForRouter(jobId, routerId);
    if (!job) throw new NotFoundError('Job not found or not running.');
    const now = this.clock.now();
    if (result.ok) {
      await this.repo.markDone(jobId, job.appliedState ?? 'ENABLED', now);
      await this.repo.settlePassword(job.customerId, result.secretCreated);
      return;
    }
    const retryAt =
      result.retryable && job.attempts < MAX_ATTEMPTS ? this.retryTime(now, job.attempts) : null;
    await this.repo.markFailure(jobId, result.error ?? 'Agent reported a failure', now, retryAt);
  }

  // ---- admin views ----
  async listJobs(
    query: ListNetworkJobsQuery,
  ): Promise<{ items: NetworkJobDto[]; pagination: PaginationMeta; needsAttention: number }> {
    const { items, total, needsAttention } = await this.repo.listJobs(query);
    return {
      items: items.map(toNetworkJobDto),
      pagination: { page: query.page, limit: query.limit, total },
      needsAttention,
    };
  }

  async retryJob(actor: AuthContext, jobId: string, ctx: RequestContext): Promise<void> {
    const job = await this.repo.findJob(jobId);
    if (!job) throw new NotFoundError('Job not found.');
    if (job.status !== 'FAILED') throw new ValidationError('Only failed jobs can be retried.');
    if (!(await this.repo.retryForCustomer(job.customerId))) {
      throw new ValidationError('This customer is not managed on a router any more.');
    }
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.NETWORK_JOB_RETRIED,
      targetType: 'customer',
      targetId: job.customerId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { jobId },
    });
  }

  private retryTime(now: Date, attempts: number): Date {
    const minutes = RETRY_DELAYS_MINUTES[Math.min(attempts, RETRY_DELAYS_MINUTES.length) - 1] ?? 60;
    return new Date(now.getTime() + minutes * 60_000);
  }
}
