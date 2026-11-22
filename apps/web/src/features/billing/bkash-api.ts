import type { BkashImportResultDto, BkashTransactionDto, PaginationMeta } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const bkashKey = ['bkash'] as const;

export async function fetchBkashTransactions(page: number, status: string) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  const res = await api.get<BkashTransactionDto[]>(`/bkash/transactions?${params}`);
  return {
    transactions: res.data,
    pagination: res.meta['pagination'] as PaginationMeta,
    needsReview: Number(res.meta['needsReview'] ?? 0),
  };
}

/** Sends the statement in slices so each request stays short; totals are summed across slices. */
export async function importBkashStatement(
  fileName: string,
  csv: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ data: BkashImportResultDto }> {
  let offset: number | null = 0;
  let total = null as BkashImportResultDto | null;
  while (offset !== null) {
    const res: { data: BkashImportResultDto } = await api.post<BkashImportResultDto>(
      '/bkash/imports',
      { fileName, csv, offset },
    );
    const d: BkashImportResultDto = res.data;
    total = total
      ? {
          ...total,
          posted: total.posted + d.posted,
          verified: total.verified + d.verified,
          needsReview: total.needsReview + d.needsReview,
          duplicates: total.duplicates + d.duplicates,
          invalid: total.invalid + d.invalid,
          nextOffset: d.nextOffset,
        }
      : d;
    offset = d.nextOffset;
    onProgress?.(offset ?? d.totalRows, d.totalRows);
  }
  return { data: { ...(total as BkashImportResultDto), nextOffset: null } };
}
export const assignBkashTransaction = (id: string, customerId: string) =>
  api.post<BkashTransactionDto>(`/bkash/transactions/${id}/assign`, { customerId });
export const ignoreBkashTransaction = (id: string, reason: string) =>
  api.post<BkashTransactionDto>(`/bkash/transactions/${id}/ignore`, { reason });
