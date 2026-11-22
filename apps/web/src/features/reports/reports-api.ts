import type { DueRowDto, PaginationMeta, ReportSummaryDto, TrendMonthDto } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const reportsKey = ['reports'] as const;

export const fetchSummary = async (period: string) =>
  (await api.get<ReportSummaryDto>(`/reports/summary${period ? `?period=${period}` : ''}`)).data;

export async function fetchDues(page: number, search: string, overdueOnly: boolean) {
  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (search) params.set('search', search);
  if (overdueOnly) params.set('overdueOnly', 'true');
  const res = await api.get<DueRowDto[]>(`/reports/dues?${params}`);
  return { rows: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

/** CSV files are plain GET downloads; the session cookie authorizes them. */
export const duesCsvUrl = (search: string, overdueOnly: boolean) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (overdueOnly) params.set('overdueOnly', 'true');
  return `/api/v1/reports/dues.csv?${params}`;
};
export const collectionsCsvUrl = (period: string) =>
  `/api/v1/reports/collections.csv${period ? `?period=${period}` : ''}`;

export const fetchTrend = async (months: number) =>
  (await api.get<TrendMonthDto[]>(`/reports/trend?months=${months}`)).data;
