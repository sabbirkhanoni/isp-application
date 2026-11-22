import type {
  LineState,
  ListLinesQuery,
  ListNetworkJobsQuery,
  RouterSyncReportDto,
} from '@isp/contracts';
import { Prisma, type Router } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import { dhakaToday } from '../../shared/utils/dhaka-time.js';
import { enqueueNetworkSync } from './network-queue.js';
import type { RouterSecretInfo } from './router-gateway.js';

export type RouterWithCount = Router & { _count: { subscriptions: number }; onlineCount: number };

export interface SessionRow {
  name: string;
  address: string | null;
  callerId: string | null;
  startedAt: Date | null;
  rxBytes: number | null;
  txBytes: number | null;
}

export interface LineRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  customerStatus: string;
  routerId: string;
  routerName: string;
  pppoeUsername: string;
  state: LineState;
  address: string | null;
  callerId: string | null;
  onlineSince: Date | null;
  lastOnlineAt: Date | null;
  routerCheckedAt: Date | null;
  routerError: string | null;
}

export interface LineCounts {
  managed: number;
  online: number;
  offline: number;
  neverSeen: number;
  activeButOffline: number;
}

export interface ClaimedJob {
  id: string;
  customerId: string;
  routerId: string;
}

export interface JobExecutionContext {
  id: string;
  customerId: string;
  attempts: number;
  customerStatus: string;
  pppoeUsername: string | null;
  profile: string | null;
  passwordEnc: string | null;
  router: Router;
}

const SUBSCRIPTION_FOR_JOB = {
  pppoeUsername: true,
  pppoePasswordEnc: true,
  package: { select: { pppProfile: true } },
} as const;

const JOB_INCLUDE = {
  customer: { select: { customerCode: true, fullName: true } },
  router: { select: { name: true } },
} as const;
export type JobWithNames = Prisma.NetworkJobGetPayload<{ include: typeof JOB_INCLUDE }>;

/** A running job whose worker vanished (server restart, agent crash) becomes claimable again after this. */
const STALE_CLAIM_MINUTES = 5;

export class NetworkRepository {
  constructor(private readonly db: Database) {}

  // ---- routers ----
  private async withOnline(
    routers: Array<Router & { _count: { subscriptions: number } }>,
  ): Promise<RouterWithCount[]> {
    if (routers.length === 0) return [];
    const rows = await this.db.$queryRaw<Array<{ router_id: string; n: number }>>`
      SELECT router_id, COUNT(*)::int AS n FROM line_status WHERE online GROUP BY router_id`;
    const online = new Map(rows.map((r) => [r.router_id, r.n]));
    return routers.map((r) => ({ ...r, onlineCount: online.get(r.id) ?? 0 }));
  }

  async listRouters(): Promise<RouterWithCount[]> {
    return this.withOnline(
      await this.db.router.findMany({
        include: { _count: { select: { subscriptions: true } } },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findRouter(id: string): Promise<RouterWithCount | null> {
    const router = await this.db.router.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    return router ? (await this.withOnline([router]))[0]! : null;
  }

  findRouterByName(name: string): Promise<Router | null> {
    return this.db.router.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  async createRouter(data: Prisma.RouterCreateInput): Promise<RouterWithCount> {
    const router = await this.db.router.create({
      data,
      include: { _count: { select: { subscriptions: true } } },
    });
    return (await this.withOnline([router]))[0]!;
  }

  async updateRouter(id: string, data: Prisma.RouterUpdateInput): Promise<RouterWithCount> {
    const router = await this.db.router.update({
      where: { id },
      data,
      include: { _count: { select: { subscriptions: true } } },
    });
    return (await this.withOnline([router]))[0]!;
  }

  /** Routers the server itself reads sessions from (agent routers report on their own). */
  listPollableRouters(): Promise<Router[]> {
    return this.db.router.findMany({
      where: { isActive: true, driver: 'REST', host: { not: null } },
      orderBy: { name: 'asc' },
    });
  }

  async markRouterSeen(id: string, now: Date, error: string | null): Promise<void> {
    await this.db.router.update({ where: { id }, data: { lastSeenAt: now, lastError: error } });
  }

  // ---- router account snapshot (compare report) ----
  async replaceSecrets(routerId: string, secrets: RouterSecretInfo[], now: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM router_secrets WHERE router_id = ${routerId}::uuid`;
      // Chunked so one statement never carries a huge parameter list.
      for (let i = 0; i < secrets.length; i += 1000) {
        const part = secrets.slice(i, i + 1000);
        await tx.$executeRaw`
          INSERT INTO router_secrets (router_id, name, profile, disabled)
          SELECT ${routerId}::uuid, u.name, u.profile, u.disabled
          FROM unnest(${part.map((x) => x.name)}::text[], ${part.map((x) => x.profile)}::text[],
                      ${part.map((x) => x.disabled)}::boolean[]) AS u(name, profile, disabled)
          ON CONFLICT (router_id, name) DO NOTHING`;
      }
      await tx.router.update({ where: { id: routerId }, data: { secretsSyncedAt: now } });
    });
  }

  async compareReport(routerId: string): Promise<Omit<RouterSyncReportDto, 'routerName'> | null> {
    const router = await this.db.router.findUnique({ where: { id: routerId } });
    if (!router) return null;
    const [routerOnly, missing, mismatches, count] = await Promise.all([
      this.db.$queryRaw<RouterSyncReportDto['routerOnly']>`
        SELECT rs.name, rs.profile, rs.disabled FROM router_secrets rs
        LEFT JOIN subscriptions s ON s.router_id = rs.router_id AND s.pppoe_username = rs.name
        WHERE rs.router_id = ${routerId}::uuid AND s.id IS NULL ORDER BY rs.name`,
      this.db.$queryRaw<RouterSyncReportDto['missingOnRouter']>`
        SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.full_name AS "customerName",
               s.pppoe_username AS "pppoeUsername", (s.pppoe_password_enc IS NOT NULL) AS "canCreate"
        FROM subscriptions s JOIN customers c ON c.id = s.customer_id
        LEFT JOIN router_secrets rs ON rs.router_id = s.router_id AND rs.name = s.pppoe_username
        WHERE s.router_id = ${routerId}::uuid AND s.pppoe_username IS NOT NULL
          AND c.status <> 'TERMINATED' AND rs.name IS NULL
        ORDER BY c.customer_code`,
      this.db.$queryRaw<RouterSyncReportDto['mismatches']>`
        SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.full_name AS "customerName",
               s.pppoe_username AS "pppoeUsername", p.ppp_profile AS "wantedProfile",
               rs.profile AS "routerProfile", (c.status <> 'ACTIVE') AS "wantedDisabled",
               rs.disabled AS "routerDisabled"
        FROM subscriptions s JOIN customers c ON c.id = s.customer_id
        JOIN packages p ON p.id = s.package_id
        JOIN router_secrets rs ON rs.router_id = s.router_id AND rs.name = s.pppoe_username
        WHERE s.router_id = ${routerId}::uuid AND c.status <> 'TERMINATED'
          AND ((p.ppp_profile IS NOT NULL AND rs.profile IS DISTINCT FROM p.ppp_profile)
               OR rs.disabled <> (c.status <> 'ACTIVE'))
        ORDER BY c.customer_code`,
      this.db.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n FROM router_secrets WHERE router_id = ${routerId}::uuid`,
    ]);
    return {
      routerId,
      checkedAt: router.secretsSyncedAt?.toISOString() ?? null,
      routerCount: count[0]?.n ?? 0,
      routerOnly,
      missingOnRouter: missing,
      mismatches,
    };
  }

  /** Router-only accounts with the package whose profile they use (for the import sheet). */
  routerOnlyWithPackage(
    routerId: string,
  ): Promise<Array<{ name: string; disabled: boolean; packageName: string | null }>> {
    return this.db.$queryRaw`
      SELECT rs.name, rs.disabled, (SELECT p.name FROM packages p WHERE p.ppp_profile = rs.profile
                                    ORDER BY p.name LIMIT 1) AS "packageName"
      FROM router_secrets rs
      LEFT JOIN subscriptions s ON s.router_id = rs.router_id AND s.pppoe_username = rs.name
      WHERE rs.router_id = ${routerId}::uuid AND s.id IS NULL ORDER BY rs.name`;
  }

  async passwordOf(customerId: string): Promise<string | null> {
    const sub = await this.db.subscription.findUnique({
      where: { customerId },
      select: { pppoePasswordEnc: true },
    });
    return sub?.pppoePasswordEnc ?? null;
  }

  /** Queues one sync job per customer, in a single transaction. */
  async queueSyncFor(customerIds: string[]): Promise<number> {
    let queued = 0;
    await this.db.$transaction(async (tx) => {
      for (const id of customerIds) {
        if (await enqueueNetworkSync(tx, id)) queued += 1;
      }
    });
    return queued;
  }

  // ---- live line status ----
  /** Makes line_status match what the router just reported: listed logins online, the rest offline. */
  async replaceSessions(routerId: string, sessions: SessionRow[], now: Date): Promise<void> {
    const names = sessions.map((x) => x.name);
    await this.db.$transaction(async (tx) => {
      if (sessions.length > 0) {
        await this.addUsage(tx, routerId, sessions, now);
        await tx.$executeRaw`
          INSERT INTO line_status (router_id, pppoe_username, online, address, caller_id,
                                   session_started_at, last_online_at, updated_at, rx_bytes, tx_bytes)
          SELECT ${routerId}::uuid, u.name, true, u.address, u.caller_id, u.started, ${now}, ${now},
                 u.rx, u.tx
          FROM unnest(${names}::text[], ${sessions.map((x) => x.address)}::text[],
                      ${sessions.map((x) => x.callerId)}::text[],
                      ${sessions.map((x) => x.startedAt?.toISOString() ?? null)}::timestamptz[],
                      ${sessions.map((x) => x.rxBytes)}::bigint[],
                      ${sessions.map((x) => x.txBytes)}::bigint[])
               AS u(name, address, caller_id, started, rx, tx)
          ON CONFLICT (router_id, pppoe_username) DO UPDATE SET
            online = true, address = EXCLUDED.address, caller_id = EXCLUDED.caller_id,
            session_started_at = EXCLUDED.session_started_at,
            last_online_at = EXCLUDED.last_online_at, updated_at = EXCLUDED.updated_at,
            rx_bytes = EXCLUDED.rx_bytes, tx_bytes = EXCLUDED.tx_bytes`;
      }
      await tx.$executeRaw`
        UPDATE line_status
           SET online = false, address = NULL, caller_id = NULL, session_started_at = NULL,
               rx_bytes = NULL, tx_bytes = NULL, updated_at = ${now}
         WHERE router_id = ${routerId}::uuid AND online
           AND NOT (pppoe_username = ANY(${names}::text[]))`;
    });
  }

  /**
   * Adds today's traffic: the growth of each session's byte counters since the previous poll. A counter that
   * went down (or a login that was offline before) means a new session, so its whole value counts. A login
   * seen for the very first time counts nothing, because its counters may hold hours of old traffic.
   */
  private async addUsage(
    tx: Prisma.TransactionClient,
    routerId: string,
    sessions: SessionRow[],
    now: Date,
  ): Promise<void> {
    const withCounters = sessions.filter((s) => s.rxBytes !== null && s.txBytes !== null);
    if (withCounters.length === 0) return;
    const previous = await tx.lineStatus.findMany({
      where: { routerId, pppoeUsername: { in: withCounters.map((s) => s.name) } },
      select: { pppoeUsername: true, online: true, rxBytes: true, txBytes: true },
    });
    const before = new Map(previous.map((p) => [p.pppoeUsername, p]));
    const names: string[] = [];
    const down: number[] = [];
    const up: number[] = [];
    for (const s of withCounters) {
      const prev = before.get(s.name);
      if (!prev) continue;
      const rx = s.rxBytes as number;
      const tx_ = s.txBytes as number;
      const continuing =
        prev.online &&
        prev.rxBytes !== null &&
        prev.txBytes !== null &&
        rx >= Number(prev.rxBytes) &&
        tx_ >= Number(prev.txBytes);
      const upload = continuing ? rx - Number(prev.rxBytes) : rx;
      const download = continuing ? tx_ - Number(prev.txBytes) : tx_;
      if (upload === 0 && download === 0) continue;
      names.push(s.name);
      up.push(upload);
      down.push(download);
    }
    if (names.length === 0) return;
    const day = dhakaToday(now);
    await tx.$executeRaw`
      INSERT INTO usage_daily (router_id, pppoe_username, day, download_bytes, upload_bytes)
      SELECT ${routerId}::uuid, u.name, ${day}::date, u.down, u.up
      FROM unnest(${names}::text[], ${down}::bigint[], ${up}::bigint[]) AS u(name, down, up)
      ON CONFLICT (router_id, pppoe_username, day) DO UPDATE SET
        download_bytes = usage_daily.download_bytes + EXCLUDED.download_bytes,
        upload_bytes = usage_daily.upload_bytes + EXCLUDED.upload_bytes`;
  }

  private lineBase = Prisma.sql`
    FROM subscriptions s
    JOIN customers c ON c.id = s.customer_id
    JOIN routers r ON r.id = s.router_id
    LEFT JOIN line_status ls ON ls.router_id = s.router_id AND ls.pppoe_username = s.pppoe_username
    WHERE s.pppoe_username IS NOT NULL AND c.status IN ('ACTIVE', 'SUSPENDED')`;

  private static readonly STATE = Prisma.sql`
    (CASE WHEN ls.router_id IS NULL THEN 'NEVER_SEEN' WHEN ls.online THEN 'ONLINE' ELSE 'OFFLINE' END)`;

  private lineSelect = Prisma.sql`
    SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.full_name AS "customerName",
           c.phone, c.status::text AS "customerStatus", r.id AS "routerId", r.name AS "routerName",
           s.pppoe_username AS "pppoeUsername", ${NetworkRepository.STATE} AS state,
           ls.address, ls.caller_id AS "callerId", ls.session_started_at AS "onlineSince",
           ls.last_online_at AS "lastOnlineAt", r.last_seen_at AS "routerCheckedAt",
           r.last_error AS "routerError"`;

  async listLines(query: ListLinesQuery): Promise<{ items: LineRow[]; total: number }> {
    const filter =
      query.filter === 'ALL'
        ? Prisma.empty
        : Prisma.sql`AND ${NetworkRepository.STATE} = ${query.filter}`;
    const like = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null;
    const search = like
      ? Prisma.sql`AND (c.customer_code ILIKE ${like} OR c.full_name ILIKE ${like}
                        OR c.phone ILIKE ${like} OR s.pppoe_username ILIKE ${like})`
      : Prisma.empty;
    const offset = (query.page - 1) * query.limit;
    const [items, count] = await Promise.all([
      this.db.$queryRaw<LineRow[]>`
        ${this.lineSelect} ${this.lineBase} ${filter} ${search}
        ORDER BY (CASE WHEN ls.online IS NOT TRUE AND c.status = 'ACTIVE' THEN 0 ELSE 1 END),
                 c.customer_code
        LIMIT ${query.limit} OFFSET ${offset}`,
      this.db.$queryRaw<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n ${this.lineBase} ${filter} ${search}`,
    ]);
    return { items, total: count[0]?.n ?? 0 };
  }

  async findLine(customerId: string): Promise<LineRow | null> {
    const rows = await this.db.$queryRaw<LineRow[]>`
      ${this.lineSelect} ${this.lineBase} AND c.id = ${customerId}::uuid`;
    return rows[0] ?? null;
  }

  async lineCounts(): Promise<LineCounts> {
    const rows = await this.db.$queryRaw<LineCounts[]>`
      SELECT COUNT(*)::int AS managed,
             COUNT(*) FILTER (WHERE ls.online)::int AS online,
             COUNT(*) FILTER (WHERE ls.online IS FALSE)::int AS offline,
             COUNT(*) FILTER (WHERE ls.router_id IS NULL)::int AS "neverSeen",
             COUNT(*) FILTER (WHERE ls.online IS FALSE AND c.status = 'ACTIVE')::int AS "activeButOffline"
      ${this.lineBase}`;
    return rows[0] ?? { managed: 0, online: 0, offline: 0, neverSeen: 0, activeButOffline: 0 };
  }

  // ---- jobs ----
  /** Atomically moves due jobs to RUNNING. Two servers (or a server and an agent) never get the same job. */
  async claimDue(
    driver: 'REST' | 'AGENT',
    now: Date,
    limit: number,
    routerId?: string,
  ): Promise<ClaimedJob[]> {
    const rows = await this.db.$queryRaw<
      Array<{ id: string; customer_id: string; router_id: string }>
    >`
      UPDATE network_jobs SET status = 'RUNNING', claimed_at = ${now}::timestamptz, attempts = attempts + 1
      WHERE id IN (
        SELECT j.id FROM network_jobs j JOIN routers r ON r.id = j.router_id
        WHERE r.is_active AND r.driver = ${driver}::router_driver
          AND (${routerId ?? null}::uuid IS NULL OR j.router_id = ${routerId ?? null}::uuid)
          AND ((j.status = 'PENDING' AND (j.run_after IS NULL OR j.run_after <= ${now}::timestamptz))
            OR (j.status = 'RUNNING'
                AND j.claimed_at < ${now}::timestamptz - make_interval(mins => ${STALE_CLAIM_MINUTES})))
        ORDER BY j.created_at
        LIMIT ${limit}
        FOR UPDATE OF j SKIP LOCKED)
      RETURNING id, customer_id, router_id`;
    return rows.map((r) => ({ id: r.id, customerId: r.customer_id, routerId: r.router_id }));
  }

  async loadForExecution(id: string): Promise<JobExecutionContext | null> {
    const job = await this.db.networkJob.findUnique({
      where: { id },
      include: {
        router: true,
        customer: { select: { status: true, subscription: { select: SUBSCRIPTION_FOR_JOB } } },
      },
    });
    if (!job) return null;
    const sub = job.customer.subscription;
    return {
      id: job.id,
      customerId: job.customerId,
      attempts: job.attempts,
      customerStatus: job.customer.status,
      pppoeUsername: sub?.pppoeUsername ?? null,
      profile: sub?.package.pppProfile ?? null,
      passwordEnc: sub?.pppoePasswordEnc ?? null,
      router: job.router,
    };
  }

  async recordAppliedState(id: string, appliedState: string): Promise<void> {
    await this.db.networkJob.update({ where: { id }, data: { appliedState } });
  }

  /** A success also clears older failures of the same customer: they no longer need attention. */
  async markDone(id: string, appliedState: string, now: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const job = await tx.networkJob.update({
        where: { id },
        data: { status: 'DONE', appliedState, finishedAt: now, lastError: null },
      });
      await tx.networkJob.deleteMany({ where: { customerId: job.customerId, status: 'FAILED' } });
    });
  }

  /** `retryAt` null means give up. */
  async markFailure(id: string, error: string, now: Date, retryAt: Date | null): Promise<void> {
    await this.db.networkJob.update({
      where: { id },
      data: retryAt
        ? { status: 'PENDING', runAfter: retryAt, lastError: error }
        : { status: 'FAILED', finishedAt: now, lastError: error },
    });
  }

  async findJobForRouter(id: string, routerId: string) {
    return this.db.networkJob.findFirst({ where: { id, routerId, status: 'RUNNING' } });
  }

  async jobPayload(id: string): Promise<{
    pppoeUsername: string | null;
    customerStatus: string;
    profile: string | null;
    passwordEnc: string | null;
  } | null> {
    const job = await this.db.networkJob.findUnique({
      where: { id },
      select: {
        customer: { select: { status: true, subscription: { select: SUBSCRIPTION_FOR_JOB } } },
      },
    });
    const sub = job?.customer.subscription;
    return job
      ? {
          pppoeUsername: sub?.pppoeUsername ?? null,
          customerStatus: job.customer.status,
          profile: sub?.package.pppProfile ?? null,
          passwordEnc: sub?.pppoePasswordEnc ?? null,
        }
      : null;
  }

  /**
   * The first successful job settles what the stored password is worth: if the system created the
   * account, the password is the real one (kept); if the account already existed, the stored password
   * never reached the router, so it is discarded rather than shown as if it were real.
   */
  async settlePassword(customerId: string, created: boolean): Promise<void> {
    if (created) {
      await this.db.subscription.updateMany({
        where: { customerId, pppoePasswordEnc: { not: null } },
        data: { pppoePasswordVerified: true },
      });
    } else {
      await this.db.subscription.updateMany({
        where: { customerId, pppoePasswordVerified: false },
        data: { pppoePasswordEnc: null },
      });
    }
  }

  async listJobs(query: ListNetworkJobsQuery) {
    const where: Prisma.NetworkJobWhereInput = query.status ? { status: query.status } : {};
    const [items, total, needsAttention] = await this.db.$transaction([
      this.db.networkJob.findMany({
        where,
        include: JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.networkJob.count({ where }),
      this.db.networkJob.count({ where: { status: 'FAILED' } }),
    ]);
    return { items, total, needsAttention };
  }

  /** Re-queues a customer after a failure (or on demand). */
  retryForCustomer(customerId: string): Promise<boolean> {
    return this.db.$transaction((tx) => enqueueNetworkSync(tx, customerId));
  }

  findJob(id: string) {
    return this.db.networkJob.findUnique({ where: { id } });
  }
}
