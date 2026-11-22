import type { CustomerUsageDto, TopUsageRowDto } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const usageKey = ['usage'] as const;
export const fetchCustomerUsage = async (customerId: string) =>
  (await api.get<CustomerUsageDto>(`/usage/customers/${customerId}`)).data;
export const fetchTopUsage = async (period: string) =>
  (await api.get<TopUsageRowDto[]>(`/usage/top${period ? `?period=${period}` : ''}`)).data;
