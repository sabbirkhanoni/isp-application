import type { DataQualityGroup, ExportName, SystemCheckItem, SystemCheckKey } from '@isp/contracts';
import type { AppConfig } from '../../config/env.js';
import { formatDateOnly } from '../../shared/utils/dhaka-time.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toCsv } from '../reports/csv.js';
import type { SystemRepository } from './system.repository.js';

type Status = SystemCheckItem['status'];
const STALE_ROUTER_MS = 30 * 60_000;

/** Whole taka, or taka with 2 decimals when there are poisha. */
function taka(poisha: bigint): string {
  const whole = poisha / 100n;
  const rest = poisha % 100n;
  return rest === 0n ? whole.toString() : `${whole}.${rest.toString().padStart(2, '0')}`;
}

export class SystemService {
  constructor(
    private readonly repo: SystemRepository,
    private readonly audit: AuditRecorder,
    private readonly config: AppConfig,
    private readonly now: () => Date,
  ) {}

  async check(): Promise<SystemCheckItem[]> {
    const items: SystemCheckItem[] = [];
    const add = (key: SystemCheckKey, status: Status, detail: string | null = null) =>
      items.push({ key, status, detail });
    const config = this.config;

    // If this query fails the whole request fails, which is itself the answer.
    const [migration, facts] = await Promise.all([this.repo.latestMigration(), this.repo.facts()]);
    add('database', 'ok');
    add('migrations', migration ? 'ok' : 'bad', migration);
    add('backgroundJobs', config.backgroundJobs ? 'ok' : 'bad');

    if (config.sms.driver === 'log') add('sms', 'warn', 'log');
    else add('sms', config.sms.apiUrl && config.sms.apiKey ? 'ok' : 'bad', 'http');
    add('ownerPhone', config.ownerPhone ? 'ok' : 'info');

    const active = facts.routers;
    if (facts.pppoeCustomers > 0 && active.length === 0) add('routers', 'bad', '0');
    else {
      const stale = active.filter(
        (r) => !r.lastSeenAt || this.now().getTime() - r.lastSeenAt.getTime() > STALE_ROUTER_MS,
      );
      const failing = active.filter((r) => r.lastError);
      add(
        'routers',
        stale.length > 0 || failing.length > 0 ? 'warn' : 'ok',
        `${active.length - stale.length}/${active.length}`,
      );
    }
    add('routerDryRun', config.network.dryRun ? 'warn' : 'ok');
    add('routerSecret', config.network.routerSecret ? 'ok' : 'bad');
    add('autoSuspend', 'info', config.network.autoSuspend ? 'on' : 'off');
    add(
      'invoices',
      facts.activeCustomers > 0 && facts.invoicesThisPeriod === 0 ? 'warn' : 'ok',
      String(facts.invoicesThisPeriod),
    );
    add('smsFailures', facts.smsFailed > 0 ? 'warn' : 'ok', String(facts.smsFailed));
    add('networkFailures', facts.jobsFailed > 0 ? 'warn' : 'ok', String(facts.jobsFailed));
    // The nightly dump runs on GitHub, outside this server, so it cannot be verified from here.
    add('backups', 'info');
    return items;
  }

  dataQuality(): Promise<DataQualityGroup[]> {
    return this.repo.dataQuality();
  }

  async exportCsv(
    name: ExportName,
    actor: AuthContext,
    ctx: RequestContext,
  ): Promise<{ filename: string; body: string }> {
    const stamp = formatDateOnly(this.now());
    const body = await this.buildCsv(name);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      targetType: 'export',
      targetId: name,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
    return { filename: `${name}-${stamp}.csv`, body };
  }

  private async buildCsv(name: ExportName): Promise<string> {
    if (name === 'customers') {
      const rows = await this.repo.customersForExport();
      return toCsv(
        [
          'customer_id',
          'name',
          'phone',
          'alt_phone',
          'address',
          'area',
          'status',
          'package',
          'monthly_price_taka',
          'connection_type',
          'pppoe_username',
          'router',
          'olt',
          'pon_port',
          'onu_serial',
          'credit_taka',
          'sms_off',
          'created_at',
        ],
        rows.map((c) => [
          c.customerCode,
          c.fullName,
          c.phone,
          c.altPhone,
          c.address,
          c.area,
          c.status,
          c.subscription?.package.name ?? null,
          c.subscription ? taka(c.subscription.package.monthlyPricePoisha) : null,
          c.subscription?.connectionType ?? null,
          c.subscription?.pppoeUsername ?? null,
          c.subscription?.router?.name ?? null,
          c.subscription?.oltName ?? null,
          c.subscription?.ponPort ?? null,
          c.subscription?.onuSerial ?? null,
          taka(c.creditPoisha),
          c.smsOptOut ? 'yes' : 'no',
          c.createdAt.toISOString(),
        ]),
      );
    }
    if (name === 'invoices') {
      const rows = await this.repo.invoicesForExport();
      return toCsv(
        [
          'invoice_no',
          'customer_id',
          'name',
          'month',
          'amount_taka',
          'paid_taka',
          'credit_used_taka',
          'due_date',
          'status',
        ],
        rows.map((i) => [
          i.invoiceNumber,
          i.customer.customerCode,
          i.customer.fullName,
          formatDateOnly(i.period).slice(0, 7),
          taka(i.amountPoisha),
          taka(i.paidPoisha),
          taka(i.creditAppliedPoisha),
          formatDateOnly(i.dueDate),
          i.status,
        ]),
      );
    }
    const rows = await this.repo.paymentsForExport();
    return toCsv(
      [
        'receipt_no',
        'customer_id',
        'name',
        'amount_taka',
        'method',
        'bkash_trx_id',
        'status',
        'received_by',
        'received_at',
        'note',
      ],
      rows.map((p) => [
        p.receiptNumber,
        p.customer.customerCode,
        p.customer.fullName,
        taka(p.amountPoisha),
        p.method,
        p.bkashTrxId,
        p.status,
        p.receiver.username,
        p.receivedAt.toISOString(),
        p.note,
      ]),
    );
  }
}
