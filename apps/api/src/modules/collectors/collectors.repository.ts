import type { Database } from '../../shared/database/prisma-client.js';

type Grouped = Array<{ collector: string | null; total: bigint | null }>;

export class CollectorsRepository {
  constructor(private readonly db: Database) {}

  customerCounts(): Promise<Grouped> {
    return this.db.$queryRaw`
      SELECT collector_id::text AS collector, COUNT(*) AS total
      FROM customers WHERE status <> 'TERMINATED' GROUP BY 1`;
  }

  billed(period: Date): Promise<Grouped> {
    return this.db.$queryRaw`
      SELECT c.collector_id::text AS collector, SUM(i.amount_poisha) AS total
      FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.period = ${period}::date GROUP BY 1`;
  }

  collected(from: Date, to: Date): Promise<Grouped> {
    return this.db.$queryRaw`
      SELECT c.collector_id::text AS collector, SUM(p.amount_poisha) AS total
      FROM payments p JOIN customers c ON c.id = p.customer_id
      WHERE p.status = 'POSTED' AND p.received_at >= ${from} AND p.received_at < ${to} GROUP BY 1`;
  }

  outstanding(): Promise<Grouped> {
    return this.db.$queryRaw`
      SELECT c.collector_id::text AS collector, SUM(i.amount_poisha - i.paid_poisha) AS total
      FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID') GROUP BY 1`;
  }

  async targets(period: Date): Promise<Map<string, number>> {
    const rows = await this.db.collectionTarget.findMany({ where: { period } });
    return new Map(rows.map((r) => [r.userId, Number(r.targetPoisha)]));
  }

  activeUsers() {
    return this.db.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async areas(): Promise<string[]> {
    const rows = await this.db.customer.findMany({
      where: { area: { not: null }, status: { not: 'TERMINATED' } },
      distinct: ['area'],
      select: { area: true },
      orderBy: { area: 'asc' },
      take: 300,
    });
    return rows.map((r) => r.area).filter((a): a is string => Boolean(a));
  }

  isActiveUser(id: string): Promise<boolean> {
    return this.db.user.count({ where: { id, status: 'ACTIVE' } }).then((n) => n > 0);
  }

  async setTarget(userId: string, period: Date, targetPoisha: number): Promise<void> {
    if (targetPoisha === 0) {
      await this.db.collectionTarget.deleteMany({ where: { userId, period } });
      return;
    }
    await this.db.collectionTarget.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, targetPoisha: BigInt(targetPoisha) },
      update: { targetPoisha: BigInt(targetPoisha), updatedAt: new Date() },
    });
  }

  async assignByArea(collectorId: string | null, area: string): Promise<number> {
    const r = await this.db.customer.updateMany({
      where: { area: { equals: area, mode: 'insensitive' }, status: { not: 'TERMINATED' } },
      data: { collectorId },
    });
    return r.count;
  }

  async assignByCodes(collectorId: string | null, codes: string[]): Promise<number> {
    const r = await this.db.customer.updateMany({
      where: { customerCode: { in: codes }, status: { not: 'TERMINATED' } },
      data: { collectorId },
    });
    return r.count;
  }
}
