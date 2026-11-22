import type { DataQualityGroup, DataQualityKey } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';

const SAMPLE_LIMIT = 25;
const MOBILE = '^(\\+?88)?01[3-9][0-9]{8}$';

interface Row {
  id: string;
  customer_code: string;
  full_name: string;
  detail: string | null;
}

/** Read-only queries behind the system check and the data-quality report. */
export class SystemRepository {
  constructor(private readonly db: Database) {}

  async latestMigration(): Promise<string | null> {
    const rows = await this.db.$queryRaw<
      Array<{ name: string }>
    >`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`;
    return rows[0]?.name ?? null;
  }

  async facts() {
    const [routers, pppoeCustomers, invoicesThisPeriod, activeCustomers, smsFailed, jobsFailed] =
      await Promise.all([
        this.db.router.findMany({
          where: { isActive: true },
          select: { name: true, lastSeenAt: true, lastError: true },
        }),
        this.db.subscription.count({
          where: { connectionType: 'PPPOE', customer: { status: { not: 'TERMINATED' } } },
        }),
        this.db.$queryRaw<
          Array<{ n: bigint }>
        >`SELECT count(*) AS n FROM invoices WHERE period = date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka'))::date`,
        this.db.customer.count({ where: { status: 'ACTIVE' } }),
        this.db.smsMessage.count({
          where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        }),
        this.db.networkJob.count({ where: { status: 'FAILED' } }),
      ]);
    return {
      routers,
      pppoeCustomers,
      invoicesThisPeriod: Number(invoicesThisPeriod[0]?.n ?? 0),
      activeCustomers,
      smsFailed,
      jobsFailed,
    };
  }

  /** Several customers using one phone number (possible duplicate entry). */
  duplicatePhone(): Promise<DataQualityGroup> {
    return this.group(
      'duplicatePhone',
      `FROM customers c
       WHERE c.status <> 'TERMINATED' AND c.phone IN (
         SELECT phone FROM customers WHERE status <> 'TERMINATED' GROUP BY phone HAVING count(*) > 1)`,
      'c.phone',
    );
  }

  /** The same PPPoE user name given to more than one customer. */
  duplicatePppoe(): Promise<DataQualityGroup> {
    return this.group(
      'duplicatePppoe',
      `FROM customers c JOIN subscriptions s ON s.customer_id = c.id
       WHERE c.status <> 'TERMINATED' AND lower(s.pppoe_username) IN (
         SELECT lower(s2.pppoe_username) FROM subscriptions s2 JOIN customers c2 ON c2.id = s2.customer_id
         WHERE c2.status <> 'TERMINATED' AND s2.pppoe_username IS NOT NULL
         GROUP BY lower(s2.pppoe_username) HAVING count(*) > 1)`,
      's.pppoe_username',
    );
  }

  invalidPhone(): Promise<DataQualityGroup> {
    return this.group(
      'invalidPhone',
      `FROM customers c WHERE c.status <> 'TERMINATED' AND c.phone !~ '${MOBILE}'`,
      'c.phone',
    );
  }

  pppoeNoRouter(): Promise<DataQualityGroup> {
    return this.group(
      'pppoeNoRouter',
      `FROM customers c JOIN subscriptions s ON s.customer_id = c.id
       WHERE c.status <> 'TERMINATED' AND s.connection_type = 'PPPOE' AND s.router_id IS NULL`,
      'NULL',
    );
  }

  /** Invoice that says more was paid than it is worth: should never happen. */
  invoiceMismatch(): Promise<DataQualityGroup> {
    return this.group(
      'invoiceMismatch',
      `FROM customers c JOIN invoices i ON i.customer_id = c.id
       WHERE i.paid_poisha + i.credit_applied_poisha > i.amount_poisha`,
      'i.invoice_number',
    );
  }

  private async group(
    key: DataQualityKey,
    fromWhere: string,
    detailSql: string,
  ): Promise<DataQualityGroup> {
    const [count, rows] = await Promise.all([
      this.db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(DISTINCT c.id) AS n ${fromWhere}`,
      ),
      this.db.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT ON (c.id) c.id, c.customer_code, c.full_name, ${detailSql}::text AS detail
         ${fromWhere} ORDER BY c.id LIMIT ${SAMPLE_LIMIT}`,
      ),
    ]);
    return {
      key,
      count: Number(count[0]?.n ?? 0),
      samples: rows.map((r) => ({
        customerId: r.id,
        customerCode: r.customer_code,
        fullName: r.full_name,
        detail: r.detail,
      })),
    };
  }

  /** Every query text above is a fixed constant in this file; no user input reaches the SQL. */
  async dataQuality(): Promise<DataQualityGroup[]> {
    return Promise.all([
      this.duplicatePhone(),
      this.duplicatePppoe(),
      this.invalidPhone(),
      this.pppoeNoRouter(),
      this.invoiceMismatch(),
    ]);
  }

  customersForExport() {
    return this.db.customer.findMany({
      include: { subscription: { include: { package: true, router: true } } },
      orderBy: { customerCode: 'asc' },
    });
  }

  invoicesForExport() {
    return this.db.invoice.findMany({
      include: { customer: { select: { customerCode: true, fullName: true } } },
      orderBy: [{ period: 'desc' }, { invoiceNumber: 'asc' }],
    });
  }

  paymentsForExport() {
    return this.db.payment.findMany({
      include: {
        customer: { select: { customerCode: true, fullName: true } },
        receiver: { select: { username: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });
  }
}
