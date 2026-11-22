import type {
  CustomerFiberDto,
  FiberRowDto,
  FiberSummary,
  OltDto,
  OltTestResultDto,
  PaginationMeta,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const oltKey = ['olts'] as const;
export const fiberKey = ['fiber'] as const;

export const fetchOlts = async () => (await api.get<OltDto[]>('/olts')).data;
/** Bodies are plain form values; the server validates them with the shared schemas. */
export const createOlt = async (input: Record<string, unknown>) =>
  (await api.post<OltDto>('/olts', input)).data;
export const updateOlt = async (id: string, input: Record<string, unknown>) =>
  (await api.patch<OltDto>(`/olts/${id}`, input)).data;
export const testOlt = async (id: string) =>
  (await api.post<OltTestResultDto>(`/olts/${id}/test`)).data;
export const pollOlt = async (id: string) =>
  (await api.post<{ stored: number }>(`/olts/${id}/poll`)).data;

export async function fetchFiber(params: { filter: string; search: string; page: number }) {
  const query = new URLSearchParams({
    filter: params.filter,
    page: String(params.page),
    limit: '25',
  });
  if (params.search) query.set('search', params.search);
  const res = await api.get<FiberRowDto[]>(`/fiber?${query}`);
  return {
    rows: res.data,
    pagination: res.meta['pagination'] as PaginationMeta,
    summary: res.meta['summary'] as FiberSummary,
  };
}

export const fetchCustomerFiber = async (customerId: string) =>
  (await api.get<CustomerFiberDto | null>(`/fiber/customer/${customerId}`)).data;
