import {
  FIBER_CRITICAL_DBM,
  FIBER_WARN_DBM,
  fiberLevel,
  type CreateOltInput,
  type CustomerFiberDto,
  type FiberRowDto,
  type FiberSummary,
  type ListFiberQuery,
  type OltBrand,
  type OltDto,
  type OltTestResultDto,
  type PaginationMeta,
  type UpdateOltInput,
} from '@isp/contracts';
import type { Olt } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logger/logger.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditAction, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { SecretBox } from '../network/secret-box.js';
import type { SmsSender } from '../notifications/sms-sender.js';
import {
  effectiveProfile,
  indexOf,
  normalizeOnuKey,
  toDbm,
  type EffectiveProfile,
} from './olt-profiles.js';
import type { OltRepository, OltWithCounts, SignalWrite } from './olt.repository.js';
import type { SnmpClient, SnmpRow, SnmpTarget } from './snmp-client.js';

const SAMPLE_COUNT = 5;
const MAX_ALERT_NAMES = 6;

interface Reading {
  onuIndex: string;
  onuKey: string;
  raw: string;
  rxDbm: number | null;
}

export class OltService {
  constructor(
    private readonly repo: OltRepository,
    private readonly snmp: SnmpClient,
    private readonly secrets: SecretBox,
    private readonly audit: AuditRecorder,
    private readonly sender: SmsSender,
    private readonly ownerPhone: string | null,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<OltDto[]> {
    return (await this.repo.list()).map(toDto);
  }

  async create(actor: AuthContext, input: CreateOltInput, ctx: RequestContext): Promise<OltDto> {
    if (await this.repo.findByName(input.name)) {
      throw new ConflictError('An OLT with this name already exists.');
    }
    const created = await this.repo.create({
      name: input.name,
      brand: input.brand,
      host: input.host,
      snmpPort: input.snmpPort,
      communityEnc: this.seal(input.community),
      rxOid: input.rxOid ?? null,
      idOid: input.idOid ?? null,
      divisor: input.divisor ?? null,
    });
    await this.record(actor, AUDIT_ACTIONS.OLT_CREATED, created.id, ctx, { name: created.name });
    return toDto({ ...created, onuCount: 0, criticalCount: 0 });
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateOltInput,
    ctx: RequestContext,
  ): Promise<OltDto> {
    const current = await this.repo.find(id);
    if (!current) throw new NotFoundError('OLT not found.');
    const same = await this.repo.findByName(input.name);
    if (same && same.id !== id) throw new ConflictError('An OLT with this name already exists.');
    await this.repo.update(id, {
      name: input.name,
      brand: input.brand,
      host: input.host,
      snmpPort: input.snmpPort,
      rxOid: input.rxOid ?? null,
      idOid: input.idOid ?? null,
      divisor: input.divisor ?? null,
      isActive: input.isActive,
      ...(input.community ? { communityEnc: this.seal(input.community) } : {}),
    });
    await this.record(actor, AUDIT_ACTIONS.OLT_UPDATED, id, ctx, { name: input.name });
    const fresh = (await this.repo.list()).find((o) => o.id === id);
    if (!fresh) throw new NotFoundError('OLT not found.');
    return toDto(fresh);
  }

  /** Reads the OLT once and shows a few raw samples, so a wrong OID or unit is obvious before saving on. */
  async test(id: string): Promise<OltTestResultDto> {
    const olt = await this.repo.find(id);
    if (!olt) throw new NotFoundError('OLT not found.');
    try {
      const readings = await this.read(olt);
      const usable = readings.filter((r) => r.rxDbm !== null).length;
      return {
        ok: usable > 0,
        message:
          usable > 0
            ? `Connected. ${usable} ONU readings found.`
            : readings.length > 0
              ? 'Connected, but none of the values look like a signal in dBm. Check the units (divisor).'
              : 'Connected, but this OID returned nothing. Check the OID for this OLT model.',
        samples: readings.slice(0, SAMPLE_COUNT),
      };
    } catch (error) {
      return { ok: false, message: describeError(error), samples: [] };
    }
  }

  /** Polls one OLT now; returns how many ONUs were stored. */
  async pollOne(id: string): Promise<{ stored: number }> {
    const olt = await this.repo.find(id);
    if (!olt) throw new NotFoundError('OLT not found.');
    const stored = await this.poll(olt);
    await this.alert();
    return { stored };
  }

  /** Background job: reads every active OLT, then tells the owner about new weak-fiber ONUs. */
  async pollAll(): Promise<{ polled: number; failed: number }> {
    const olts = await this.repo.listActive();
    let failed = 0;
    for (const olt of olts) {
      try {
        await this.poll(olt);
      } catch {
        failed += 1;
      }
    }
    await this.alert();
    return { polled: olts.length - failed, failed };
  }

  /** One SMS per round, listing the worst ONUs; each ONU is reported once until it recovers. */
  async alert(): Promise<number> {
    await this.repo.clearRecovered(FIBER_CRITICAL_DBM);
    if (!this.ownerPhone) return 0;
    const fresh = await this.repo.newlyCritical(FIBER_CRITICAL_DBM);
    if (fresh.length === 0) return 0;
    const names = fresh
      .slice(0, MAX_ALERT_NAMES)
      .map((f) => `${f.label} ${f.rxDbm.toFixed(1)}`)
      .join(', ');
    const more = fresh.length > MAX_ALERT_NAMES ? ` +${fresh.length - MAX_ALERT_NAMES} more` : '';
    try {
      await this.sender.send(
        this.ownerPhone,
        `ALERT: Weak fiber signal (below ${FIBER_CRITICAL_DBM} dBm): ${names}${more}.`,
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'Fiber alert SMS failed');
      return 0;
    }
    await this.repo.setAlerted(fresh, true);
    return 1;
  }

  async listFiber(
    query: ListFiberQuery,
  ): Promise<{ items: FiberRowDto[]; pagination: PaginationMeta; summary: FiberSummary }> {
    const { items, total, summary } = await this.repo.listFiber(
      query,
      FIBER_WARN_DBM,
      FIBER_CRITICAL_DBM,
    );
    return {
      items: items.map((r) => ({
        ...r,
        level: fiberLevel(r.rxDbm),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: { page: query.page, limit: query.limit, total },
      summary,
    };
  }

  async ofCustomer(customerId: string): Promise<CustomerFiberDto | null> {
    const row = await this.repo.ofCustomer(customerId);
    return row
      ? { ...row, level: fiberLevel(row.rxDbm), updatedAt: row.updatedAt.toISOString() }
      : null;
  }

  // ---- internals ----
  private async poll(olt: Olt): Promise<number> {
    const now = this.clock.now();
    try {
      const readings = await this.read(olt);
      const writes: SignalWrite[] = readings.flatMap((r) =>
        r.rxDbm === null ? [] : [{ onuIndex: r.onuIndex, onuKey: r.onuKey, rxDbm: r.rxDbm }],
      );
      await this.repo.replaceSignals(olt.id, writes, now);
      await this.repo.markPolled(olt.id, now, null);
      return writes.length;
    } catch (error) {
      await this.repo.markPolled(olt.id, now, describeError(error));
      throw error;
    }
  }

  private async read(olt: Olt): Promise<Reading[]> {
    const profile = effectiveProfile(olt.brand as OltBrand, olt);
    if (!profile) throw new ValidationError('This OLT has no RX power OID yet.');
    const target = this.targetOf(olt);
    const rx = await this.snmp.walk(target, profile.rxOid);
    const ids = profile.idOid ? await this.snmp.walk(target, profile.idOid) : [];
    return build(profile, rx, ids);
  }

  private targetOf(olt: Olt): SnmpTarget {
    return {
      host: olt.host,
      port: olt.snmpPort,
      community: this.secrets.decrypt(olt.communityEnc),
    };
  }

  private seal(text: string): string {
    try {
      return this.secrets.encrypt(text);
    } catch {
      throw new ValidationError(
        'ROUTER_SECRET is not set on the server, so the SNMP community cannot be saved.',
      );
    }
  }

  private async record(
    actor: AuthContext,
    action: AuditAction,
    id: string,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'olt',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}

/** Joins the RX column and the identity column on their shared row index. */
export function build(profile: EffectiveProfile, rx: SnmpRow[], ids: SnmpRow[]): Reading[] {
  const keyByIndex = new Map<string, string>();
  for (const row of ids) {
    const index = indexOf(profile.idOid ?? '', row.oid);
    if (index) keyByIndex.set(index, normalizeOnuKey(row.value));
  }
  const readings: Reading[] = [];
  for (const row of rx) {
    const index = indexOf(profile.rxOid, row.oid);
    if (!index) continue;
    readings.push({
      onuIndex: index,
      // Without an identity column the row index itself is the key (the admin types it into the customer).
      onuKey: keyByIndex.get(index) ?? normalizeOnuKey(index),
      raw: Buffer.isBuffer(row.value) ? row.value.toString('utf8') : String(row.value),
      rxDbm: toDbm(row.value, profile.divisor),
    });
  }
  return readings;
}

function describeError(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (/timed out|timeout/i.test(message)) {
    return 'The OLT did not answer. Check the IP address, SNMP port and community, and that SNMP is allowed from this server.';
  }
  return `Could not read the OLT: ${message}`;
}

function toDto(o: OltWithCounts): OltDto {
  return {
    id: o.id,
    name: o.name,
    brand: o.brand as OltBrand,
    host: o.host,
    snmpPort: o.snmpPort,
    rxOid: o.rxOid,
    idOid: o.idOid,
    divisor: o.divisor,
    isActive: o.isActive,
    lastPolledAt: o.lastPolledAt?.toISOString() ?? null,
    lastError: o.lastError,
    onuCount: o.onuCount,
    criticalCount: o.criticalCount,
  };
}
