import type {
  CreateExpenseInput,
  ExpenseCategory,
  ExpenseDto,
  ListExpensesQuery,
  PaginationMeta,
  UpdateExpenseInput,
} from '@isp/contracts';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { formatDateOnly, periodStart } from '../../shared/utils/dhaka-time.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toCsv } from '../reports/csv.js';
import type { ExpenseRecord, ExpensesRepository } from './expenses.repository.js';

const toDto = (e: ExpenseRecord): ExpenseDto => ({
  id: e.id,
  spentOn: formatDateOnly(e.spentOn),
  category: e.category as ExpenseCategory,
  amountPoisha: Number(e.amountPoisha),
  payee: e.payee,
  note: e.note,
  createdByName: e.creator.fullName,
  createdAt: e.createdAt.toISOString(),
});

/** Plain DATE columns: midnight UTC of the calendar day. */
const asDate = (text: string): Date => new Date(`${text}T00:00:00.000Z`);

/** [first day of the month, first day of the next month) as DATE values. */
function monthDates(period: string): { from: Date; to: Date } {
  const start = periodStart(period);
  return {
    from: start,
    to: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
  };
}

export class ExpensesService {
  constructor(
    private readonly repo: ExpensesRepository,
    private readonly audit: AuditRecorder,
  ) {}

  async list(
    query: ListExpensesQuery,
  ): Promise<{ items: ExpenseDto[]; pagination: PaginationMeta; totalPoisha: number }> {
    const range = query.period ? monthDates(query.period) : null;
    const { items, total, sumPoisha } = await this.repo.list(query, range, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: items.map(toDto),
      pagination: { page: query.page, limit: query.limit, total },
      totalPoisha: Number(sumPoisha),
    };
  }

  async csv(query: ListExpensesQuery): Promise<string> {
    const range = query.period ? monthDates(query.period) : null;
    const { items } = await this.repo.list(query, range, null);
    return toCsv(
      ['date', 'category', 'amount_taka', 'payee', 'note', 'entered_by'],
      items.map((e) => [
        formatDateOnly(e.spentOn),
        e.category,
        (Number(e.amountPoisha) / 100).toFixed(2),
        e.payee,
        e.note,
        e.creator.fullName,
      ]),
    );
  }

  async create(actor: AuthContext, input: CreateExpenseInput, ctx: RequestContext) {
    const created = await this.repo.create(
      {
        spentOn: asDate(input.spentOn),
        category: input.category,
        amountPoisha: BigInt(input.amountPoisha),
        payee: input.payee ?? null,
        note: input.note ?? null,
      },
      actor.userId,
    );
    await this.record(actor, ctx, AUDIT_ACTIONS.EXPENSE_CREATED, created.id, {
      category: input.category,
      amountPoisha: input.amountPoisha,
    });
    return toDto(created);
  }

  async update(actor: AuthContext, id: string, input: UpdateExpenseInput, ctx: RequestContext) {
    if (!(await this.repo.find(id))) throw new NotFoundError('Expense not found.');
    const updated = await this.repo.update(id, {
      ...(input.spentOn ? { spentOn: asDate(input.spentOn) } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.amountPoisha ? { amountPoisha: BigInt(input.amountPoisha) } : {}),
      ...(input.payee !== undefined ? { payee: input.payee } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    await this.record(actor, ctx, AUDIT_ACTIONS.EXPENSE_UPDATED, id, {
      changedFields: Object.keys(input),
    });
    return toDto(updated);
  }

  async delete(actor: AuthContext, id: string, ctx: RequestContext): Promise<void> {
    const existing = await this.repo.find(id);
    if (!existing) throw new NotFoundError('Expense not found.');
    await this.repo.delete(id);
    await this.record(actor, ctx, AUDIT_ACTIONS.EXPENSE_DELETED, id, {
      category: existing.category,
      amountPoisha: Number(existing.amountPoisha),
      spentOn: formatDateOnly(existing.spentOn),
    });
  }

  private record(
    actor: AuthContext,
    ctx: RequestContext,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    id: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'expense',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}
