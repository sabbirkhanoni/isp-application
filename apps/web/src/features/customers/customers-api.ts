import type {
  CreateCustomerInput,
  CustomerDto,
  CustomerImportResultDto,
  PaginationMeta,
  SuspendReason,
  UpdateCustomerInput,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const customersKey = ['customers'] as const;

export interface CustomerFilters {
  page: number;
  search: string;
  status: string;
}

export async function fetchCustomers(filters: CustomerFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  const res = await api.get<CustomerDto[]>(`/customers?${params}`);
  return { customers: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

export const fetchCustomer = async (id: string) =>
  (await api.get<CustomerDto>(`/customers/${id}`)).data;
export const createCustomer = (input: CreateCustomerInput) =>
  api.post<CustomerDto>('/customers', input);
export const updateCustomer = (id: string, input: UpdateCustomerInput) =>
  api.patch<CustomerDto>(`/customers/${id}`, input);
export const suspendCustomer = (id: string, reason: SuspendReason) =>
  api.post<CustomerDto>(`/customers/${id}/suspend`, { reason });
export const terminateCustomer = (id: string, prorateBill = false, note?: string) =>
  api.post<CustomerDto>(`/customers/${id}/terminate`, { prorateBill, ...(note ? { note } : {}) });
export const activateCustomer = (id: string) =>
  api.post<CustomerDto>(`/customers/${id}/activate`, {});
export const importCustomers = async (csv: string, commit: boolean, fileName: string) =>
  (await api.post<CustomerImportResultDto>('/customers/import', { csv, commit, fileName })).data;
