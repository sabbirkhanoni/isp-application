import { randomUUID } from 'node:crypto';
import type { CustomerImportResultDto, ImportCustomersInput } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import { ValidationError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { ImportFormatError, parseCustomerImport, type ImportRow } from './customer-import.js';

const CHUNK = 500;
const MAX_REPORTED_ERRORS = 200;
const GENERATED_CODE = /^C(\d+)$/i;

/**
 * One-time loading of the customers the ISP already has. Existing IDs are kept as written.
 * The import never touches routers and sends no SMS: these customers are already online.
 */
export class CustomerImportService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async run(
    actor: AuthContext,
    input: ImportCustomersInput,
    ctx: RequestContext,
  ): Promise<CustomerImportResultDto> {
    const [packages, routers, codes, usernames] = await Promise.all([
      this.db.package.findMany({ select: { id: true, name: true, isActive: true } }),
      this.db.router.findMany({ select: { id: true, name: true, isActive: true } }),
      this.db.customer.findMany({ select: { customerCode: true } }),
      this.db.subscription.findMany({
        where: { pppoeUsername: { not: null } },
        select: { pppoeUsername: true },
      }),
    ]);

    let parsed;
    try {
      parsed = parseCustomerImport(input.csv, {
        packages,
        routers,
        existingCodes: new Set(codes.map((c) => c.customerCode.toLowerCase())),
        existingPppoe: new Set(usernames.map((u) => (u.pppoeUsername ?? '').toLowerCase())),
      });
    } catch (error) {
      if (error instanceof ImportFormatError) throw new ValidationError(error.message);
      throw error;
    }

    const result: CustomerImportResultDto = {
      committed: false,
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      created: 0,
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, MAX_REPORTED_ERRORS),
    };
    // All or nothing: a file with any problem saves nothing, so the owner never has half a customer list.
    if (!input.commit || parsed.errors.length > 0 || parsed.rows.length === 0) return result;

    await this.db.$transaction(
      async (tx) => {
        for (let i = 0; i < parsed.rows.length; i += CHUNK) {
          const rows = parsed.rows.slice(i, i + CHUNK).map((row) => ({ row, id: randomUUID() }));
          await tx.customer.createMany({
            data: rows.map(({ row, id }) => this.customerData(row, id, actor.userId)),
          });
          await tx.subscription.createMany({
            data: rows.map(({ row, id }) => ({
              customerId: id,
              packageId: row.packageId,
              connectionType: row.connectionType,
              pppoeUsername: row.pppoeUsername,
              activationPolicy: 'ACTIVATE_NOW' as const,
              routerId: row.routerId,
            })),
          });
        }
        await this.advanceCodeSequence(tx, parsed.rows);
      },
      { timeout: 60_000 },
    );

    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMERS_IMPORTED,
      targetType: 'customer',
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { count: parsed.rows.length, fileName: input.fileName },
    });
    return { ...result, committed: true, created: parsed.rows.length };
  }

  private customerData(row: ImportRow, id: string, createdBy: string) {
    const suspended = row.status === 'SUSPENDED';
    return {
      id,
      customerCode: row.customerCode,
      fullName: row.fullName,
      phone: row.phone,
      address: row.address,
      area: row.area,
      status: row.status,
      // A customer that was already cut off stays off until an admin decides; payments do not reconnect them.
      suspendReason: suspended ? ('MANUAL' as const) : null,
      suspendedAt: suspended ? this.clock.now() : null,
      createdBy,
    };
  }

  /** Imported IDs like C00123 must not be handed out again to new customers. */
  private async advanceCodeSequence(
    tx: Parameters<Parameters<Database['$transaction']>[0]>[0],
    rows: ImportRow[],
  ): Promise<void> {
    const highest = rows.reduce((max, row) => {
      const match = GENERATED_CODE.exec(row.customerCode);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    if (highest === 0) return;
    await tx.$executeRaw`
      SELECT setval('customer_code_seq', GREATEST(${highest}::bigint, (SELECT last_value FROM customer_code_seq)))`;
  }
}
