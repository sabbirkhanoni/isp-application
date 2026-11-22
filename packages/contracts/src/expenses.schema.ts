import { z } from 'zod';
import { emptyToUndefined, paginationQuerySchema } from './common.schema.js';
import { periodSchema } from './billing.schema.js';

export const EXPENSE_CATEGORIES = [
  'SALARY',
  'BANDWIDTH',
  'RENT',
  'ELECTRICITY',
  'EQUIPMENT',
  'TRANSPORT',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createExpenseSchema = z.object({
  spentOn: dateOnly,
  category: z.enum(EXPENSE_CATEGORIES),
  amountPoisha: z.number().int().min(100).max(100_000_000_00),
  payee: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z
  .object({
    spentOn: dateOnly,
    category: z.enum(EXPENSE_CATEGORIES),
    amountPoisha: z.number().int().min(100).max(100_000_000_00),
    payee: z.string().trim().max(80).nullable(),
    note: z.string().trim().max(300).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = paginationQuerySchema.extend({
  period: z.preprocess(emptyToUndefined, periodSchema.optional()),
  category: z.preprocess(emptyToUndefined, z.enum(EXPENSE_CATEGORIES).optional()),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export interface ExpenseDto {
  id: string;
  spentOn: string;
  category: ExpenseCategory;
  amountPoisha: number;
  payee: string | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
}
