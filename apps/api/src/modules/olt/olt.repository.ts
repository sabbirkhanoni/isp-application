import type { FiberSummary, ListFiberQuery } from '@isp/contracts';
import { Prisma, type Olt } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

export interface SignalWrite {
  onuIndex: string;
  onuKey: string;
  rxDbm: number;
}

export interface FiberRow {
  oltName: string;
  onuIndex: string;
  onuKey: string;
  rxDbm: number;
  updatedAt: Date;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  phone: string | null;
}

export interface OltWithCounts extends Olt {
  onuCount: number;
  criticalCount: number;
}

const KEY_OF_CUSTOMER = Prisma.sql`regexp_replace(upper(sub.onu_serial), '[^A-Z0-9]', '', 'g')`;

/** Where the fiber filter applies; `critical` is the alert threshold in dBm. */
function filterSql(filter: ListFiberQuery['filter'], warn: number, critical: number): Prisma.Sql {
  switch (filter) {
    case 'CRITICAL':
      return Prisma.sql`AND s.rx_dbm < ${critical}`;
    case 'WEAK':
      return Prisma.sql`AND s.rx_dbm >= ${critical} AND s.rx_dbm < ${warn}`;
    case 'GOOD':
      return Prisma.sql`AND s.rx_dbm >= ${warn}`;
    case 'UNMATCHED':
      return Prisma.sql`AND c.id IS NULL`;
    default:
      return Prisma.empty;
  }
}

export class OltRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<OltWithCounts[]> {
    const olts = await this.db.olt.findMany({ orderBy: { name: 'asc' } });
    const counts = await this.db.$queryRaw<
      Array<{ olt_id: string; n: number; bad: number }>
    >`SELECT olt_id, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE rx_dbm < -27)::int AS bad
      FROM onu_signals GROUP BY olt_id`;
    const by = new Map(counts.map((c) => [c.olt_id, c]));
    return olts.map((o) => ({
      ...o,
      onuCount: by.get(o.id)?.n ?? 0,
      criticalCount: by.get(o.id)?.bad ?? 0,
    }));
  }

  async find(id: string): Promise<Olt | null> {
    return this.db.olt.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Olt | null> {
    return this.db.olt.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  async create(data: Prisma.OltUncheckedCreateInput): Promise<Olt> {
    return this.db.olt.create({ data });
  }

  async update(id: string, data: Prisma.OltUncheckedUpdateInput): Promise<Olt> {
    return this.db.olt.update({ where: { id }, data });
  }

  async listActive(): Promise<Olt[]> {
    return this.db.olt.findMany({ where: { isActive: true } });
  }

  async markPolled(id: string, now: Date, error: string | null): Promise<void> {
    await this.db.olt.update({ where: { id }, data: { lastPolledAt: now, lastError: error } });
  }

  /** Replaces one OLT's readings; the "already alerted" flag carries over so one fault sends one SMS. */
  async replaceSignals(oltId: string, signals: SignalWrite[], now: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const old = await tx.onuSignal.findMany({
        where: { oltId },
        select: { onuIndex: true, alerted: true },
      });
      const alerted = new Map(old.map((o) => [o.onuIndex, o.alerted]));
      await tx.onuSignal.deleteMany({ where: { oltId } });
      await tx.onuSignal.createMany({
        data: signals.map((s) => ({
          oltId,
          onuIndex: s.onuIndex,
          onuKey: s.onuKey,
          rxDbm: s.rxDbm,
          alerted: alerted.get(s.onuIndex) ?? false,
          updatedAt: now,
        })),
      });
    });
  }

  /** ONUs under the critical level that the owner has not been told about yet, with their customer if known. */
  async newlyCritical(
    critical: number,
  ): Promise<Array<{ oltId: string; onuIndex: string; rxDbm: number; label: string }>> {
    return this.db.$queryRaw`
      SELECT s.olt_id AS "oltId", s.onu_index AS "onuIndex", s.rx_dbm::float8 AS "rxDbm",
             COALESCE(c.full_name || ' (' || c.customer_code || ')', 'ONU ' || s.onu_key) AS label
      FROM onu_signals s
      LEFT JOIN subscriptions sub ON ${KEY_OF_CUSTOMER} = s.onu_key
      LEFT JOIN customers c ON c.id = sub.customer_id AND c.status <> 'TERMINATED'
      WHERE s.rx_dbm < ${critical} AND s.alerted = false
      ORDER BY s.rx_dbm`;
  }

  async setAlerted(
    items: Array<{ oltId: string; onuIndex: string }>,
    value: boolean,
  ): Promise<void> {
    for (const item of items) {
      await this.db.onuSignal.update({
        where: { oltId_onuIndex: { oltId: item.oltId, onuIndex: item.onuIndex } },
        data: { alerted: value },
      });
    }
  }

  /** ONUs that are back to normal (1 dB of margin so a flapping value does not alert again and again). */
  async clearRecovered(critical: number): Promise<void> {
    await this.db.$executeRaw`
      UPDATE onu_signals SET alerted = false WHERE alerted = true AND rx_dbm >= ${critical + 1}`;
  }

  async listFiber(
    query: ListFiberQuery,
    warn: number,
    critical: number,
  ): Promise<{ items: FiberRow[]; total: number; summary: FiberSummary }> {
    const filter = filterSql(query.filter, warn, critical);
    const like = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null;
    const search = like
      ? Prisma.sql`AND (c.full_name ILIKE ${like} OR c.customer_code ILIKE ${like}
                        OR c.phone ILIKE ${like} OR s.onu_key ILIKE ${like})`
      : Prisma.empty;
    const base = Prisma.sql`FROM onu_signals s JOIN olts o ON o.id = s.olt_id
      LEFT JOIN subscriptions sub ON ${KEY_OF_CUSTOMER} = s.onu_key
      LEFT JOIN customers c ON c.id = sub.customer_id AND c.status <> 'TERMINATED'
      WHERE o.is_active = true`;
    const offset = (query.page - 1) * query.limit;
    const [items, total, summary] = await Promise.all([
      this.db.$queryRaw<FiberRow[]>`
        SELECT o.name AS "oltName", s.onu_index AS "onuIndex", s.onu_key AS "onuKey",
               s.rx_dbm::float8 AS "rxDbm", s.updated_at AS "updatedAt",
               c.id AS "customerId", c.customer_code AS "customerCode",
               c.full_name AS "customerName", c.phone
        ${base} ${filter} ${search}
        ORDER BY s.rx_dbm ASC LIMIT ${query.limit} OFFSET ${offset}`,
      this.db.$queryRaw<
        Array<{ n: number }>
      >`SELECT COUNT(*)::int AS n ${base} ${filter} ${search}`,
      this.db.$queryRaw<Array<FiberSummary>>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE s.rx_dbm >= ${warn})::int AS good,
               COUNT(*) FILTER (WHERE s.rx_dbm >= ${critical} AND s.rx_dbm < ${warn})::int AS weak,
               COUNT(*) FILTER (WHERE s.rx_dbm < ${critical})::int AS critical
        ${base}`,
    ]);
    return {
      items,
      total: total[0]?.n ?? 0,
      summary: summary[0] ?? { total: 0, good: 0, weak: 0, critical: 0 },
    };
  }

  async ofCustomer(
    customerId: string,
  ): Promise<{ rxDbm: number; updatedAt: Date; oltName: string } | null> {
    const rows = await this.db.$queryRaw<
      Array<{ rxDbm: number; updatedAt: Date; oltName: string }>
    >`
      SELECT s.rx_dbm::float8 AS "rxDbm", s.updated_at AS "updatedAt", o.name AS "oltName"
      FROM customers c
      JOIN subscriptions sub ON sub.customer_id = c.id
      JOIN onu_signals s ON s.onu_key = ${KEY_OF_CUSTOMER}
      JOIN olts o ON o.id = s.olt_id AND o.is_active = true
      WHERE c.id = ${customerId}::uuid AND sub.onu_serial IS NOT NULL
      ORDER BY s.updated_at DESC LIMIT 1`;
    return rows[0] ?? null;
  }
}
