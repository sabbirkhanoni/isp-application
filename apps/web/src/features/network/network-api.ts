import type {
  CreateRouterInput,
  LineDto,
  LineSummary,
  NetworkJobDto,
  PaginationMeta,
  RouterDto,
  RouterFixResultDto,
  RouterSyncReportDto,
  RouterTestResultDto,
  RouterWithTokenDto,
  UpdateRouterInput,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const routersKey = ['routers'] as const;
export const jobsKey = ['network-jobs'] as const;

export const fetchRouters = async () => (await api.get<RouterDto[]>('/routers')).data;
export const createRouter = async (input: CreateRouterInput) =>
  (await api.post<RouterWithTokenDto>('/routers', input)).data;
export const updateRouter = async (id: string, input: UpdateRouterInput) =>
  (await api.patch<RouterDto>(`/routers/${id}`, input)).data;
export const rotateRouterToken = async (id: string) =>
  (await api.post<RouterWithTokenDto>(`/routers/${id}/token`, {})).data;
export const testRouter = async (id: string) =>
  (await api.post<RouterTestResultDto>(`/routers/${id}/test`, {})).data;

export async function fetchJobs(status: string) {
  const params = new URLSearchParams({ limit: '20' });
  if (status) params.set('status', status);
  const res = await api.get<NetworkJobDto[]>(`/network-jobs?${params}`);
  return {
    jobs: res.data,
    pagination: res.meta['pagination'] as PaginationMeta,
    needsAttention: Number(res.meta['needsAttention'] ?? 0),
  };
}
export const retryJob = (id: string) =>
  api.post<{ queued: boolean }>(`/network-jobs/${id}/retry`, {});

export const linesKey = ['lines'] as const;

export async function fetchLines(params: { filter: string; search: string; page: number }) {
  const query = new URLSearchParams({
    filter: params.filter,
    page: String(params.page),
    limit: '25',
  });
  if (params.search) query.set('search', params.search);
  const res = await api.get<LineDto[]>(`/network/lines?${query}`);
  return {
    lines: res.data,
    pagination: res.meta['pagination'] as PaginationMeta,
    summary: res.meta['summary'] as LineSummary,
  };
}

/** null = the customer is not managed on a router. */
export const fetchCustomerLine = async (customerId: string) =>
  (await api.get<LineDto | null>(`/network/lines/customer/${customerId}`)).data;

export const compareKey = ['router-compare'] as const;
export const fetchCompare = async (routerId: string) =>
  (await api.get<RouterSyncReportDto>(`/routers/${routerId}/compare`)).data;
export const refreshRouterAccounts = (routerId: string) =>
  api.post<{ refreshed: boolean }>(`/routers/${routerId}/refresh`, {});
export const fixRouter = async (routerId: string) =>
  (await api.post<RouterFixResultDto>(`/routers/${routerId}/fix`, {})).data;
export const routerOnlyCsvUrl = (routerId: string) => `/api/v1/routers/${routerId}/router-only.csv`;
export const fetchPppoePassword = async (customerId: string) =>
  (await api.get<{ password: string | null }>(`/network/lines/customer/${customerId}/password`))
    .data;
