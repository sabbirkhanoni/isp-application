import type {
  ApproveLeadInput,
  CreateLeadInput,
  CustomerDto,
  LeadDto,
  PaginationMeta,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const leadsKey = ['leads'] as const;

export async function fetchLeads(page: number, status: string) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  const res = await api.get<LeadDto[]>(`/leads?${params}`);
  return { leads: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

export const createLead = (input: CreateLeadInput) => api.post<LeadDto>('/leads', input);
export const approveLead = (id: string, input: ApproveLeadInput) =>
  api.post<{ lead: LeadDto; customer: CustomerDto }>(`/leads/${id}/approve`, input);
export const rejectLead = (id: string, reason?: string) =>
  api.post<LeadDto>(`/leads/${id}/reject`, { reason });
