import type { ListExpensesQuery } from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

const WITH_CREATOR = { creator: { select: { fullName: true } } } as const;
export type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof WITH_CREATOR }>;

export interface ExpenseData {
  spentOn: Date;
  category: string;
  amountPoisha: bigint;
  payee: string | null;
  note: string | null;
}

export class ExpensesRepository {
  constructor(private readonly db: Database) {}

  async list(
    query: ListExpensesQuery,
    range: { from: Date; to: Date } | null,
    page: { skip: number; take: number } | null,
  ): Promise<{ items: ExpenseRecord[]; total: number; sumPoisha: bigint }> {
    const where: Prisma.ExpenseWhereInput = {
      ...(range ? { spentOn: { gte: range.from, lt: range.to } } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total, sum] = await this.db.$transaction([
      this.db.expense.findMany({
        where,
        include: WITH_CREATOR,
        orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
        ...(page ?? {}),
      }),
      this.db.expense.count({ where }),
      this.db.expense.aggregate({ where, _sum: { amountPoisha: true } }),
    ]);
    return { items, total, sumPoisha: sum._sum.amountPoisha ?? 0n };
  }

  find(id: string): Promise<ExpenseRecord | null> {
    return this.db.expense.findUnique({ where: { id }, include: WITH_CREATOR });
  }

  create(data: ExpenseData, createdBy: string): Promise<ExpenseRecord> {
    return this.db.expense.create({ data: { ...data, createdBy }, include: WITH_CREATOR });
  }

  update(id: string, data: Partial<ExpenseData>): Promise<ExpenseRecord> {
    return this.db.expense.update({ where: { id }, data, include: WITH_CREATOR });
  }

  async delete(id: string): Promise<void> {
    await this.db.expense.delete({ where: { id } });
  }
}
