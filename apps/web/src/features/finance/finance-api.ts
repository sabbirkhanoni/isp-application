import type {
  AreaRowDto,
  ChurnReportDto,
  CollectorRowDto,
  CreateExpenseInput,
  ExpenseDto,
  PaginationMeta,
  ProfitReportDto,
  UpdateExpenseInput,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const expensesKey = ['expenses'] as const;
export const financeKey = ['finance'] as const;

export async function fetchExpenses(params: { period: string; category: string; page: number }) {
  const query = new URLSearchParams({ page: String(params.page), limit: '25' });
  if (params.period) query.set('period', params.period);
  if (params.category) query.set('category', params.category);
  const res = await api.get<ExpenseDto[]>(`/expenses?${query}`);
  return {
    items: res.data,
    pagination: res.meta['pagination'] as PaginationMeta,
    totalPoisha: res.meta['totalPoisha'] as number,
  };
}
export const createExpense = (input: CreateExpenseInput) =>
  api.post<ExpenseDto>('/expenses', input);
export const updateExpense = (id: string, input: UpdateExpenseInput) =>
  api.patch<ExpenseDto>(`/expenses/${id}`, input);
export const deleteExpense = (id: string) => api.delete<{ deleted: boolean }>(`/expenses/${id}`);
export const expensesCsvUrl = (period: string) =>
  `/api/v1/expenses/export.csv${period ? `?period=${period}` : ''}`;

const q = (period: string) => (period ? `?period=${period}` : '');
export const fetchProfit = async (period: string) =>
  (await api.get<ProfitReportDto>(`/reports/profit${q(period)}`)).data;
export const fetchCollectors = async (period: string) =>
  (await api.get<CollectorRowDto[]>(`/reports/collectors${q(period)}`)).data;
export const fetchAreas = async (period: string) =>
  (await api.get<AreaRowDto[]>(`/reports/areas${q(period)}`)).data;
export const fetchChurn = async () => (await api.get<ChurnReportDto>('/reports/churn')).data;
export const reportCsvUrl = (name: 'profit' | 'collectors' | 'areas', period: string) =>
  `/api/v1/reports/${name}.csv${q(period)}`;
