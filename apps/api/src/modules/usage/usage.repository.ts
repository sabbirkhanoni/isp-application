import type { TopUsageRowDto } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';

interface UsageRow {
  period: string;
  download: bigint | null;
  upload: bigint | null;
}

export class UsageRepository {
  constructor(private readonly db: Database) {}

  async customerMonths(customerId: string, from: Date): Promise<UsageRow[]> {
    return this.db.$queryRaw<UsageRow[]>`
      SELECT to_char(u.day, 'YYYY-MM') AS period,
             SUM(u.download_bytes) AS download, SUM(u.upload_bytes) AS upload
      FROM subscriptions s
      JOIN usage_daily u ON u.router_id = s.router_id AND u.pppoe_username = s.pppoe_username
      WHERE s.customer_id = ${customerId}::uuid AND u.day >= ${from}::date
      GROUP BY 1`;
  }

  async hasPppoe(customerId: string): Promise<boolean> {
    const s = await this.db.subscription.findUnique({
      where: { customerId },
      select: { pppoeUsername: true, routerId: true },
    });
    return Boolean(s?.pppoeUsername && s.routerId);
  }

  async top(first: Date, next: Date, limit: number): Promise<TopUsageRowDto[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        customerId: string;
        customerCode: string;
        customerName: string;
        pppoeUsername: string;
        download: bigint;
        upload: bigint;
      }>
    >`
      SELECT c.id AS "customerId", c.customer_code AS "customerCode", c.full_name AS "customerName",
             s.pppoe_username AS "pppoeUsername",
             SUM(u.download_bytes) AS download, SUM(u.upload_bytes) AS upload
      FROM usage_daily u
      JOIN subscriptions s ON s.router_id = u.router_id AND s.pppoe_username = u.pppoe_username
      JOIN customers c ON c.id = s.customer_id
      WHERE u.day >= ${first}::date AND u.day < ${next}::date
      GROUP BY c.id, c.customer_code, c.full_name, s.pppoe_username
      ORDER BY SUM(u.download_bytes + u.upload_bytes) DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      customerId: r.customerId,
      customerCode: r.customerCode,
      customerName: r.customerName,
      pppoeUsername: r.pppoeUsername,
      downloadBytes: Number(r.download),
      uploadBytes: Number(r.upload),
    }));
  }

  /** Keeps the table small enough for the free database plan. */
  async prune(before: Date): Promise<number> {
    return this.db.$executeRaw`DELETE FROM usage_daily WHERE day < ${before}::date`;
  }
}
