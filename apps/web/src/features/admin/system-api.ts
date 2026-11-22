import type { DataQualityGroup, SystemCheckItem } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const systemCheckKey = ['system-check'] as const;
export const dataQualityKey = ['data-quality'] as const;

export const fetchSystemCheck = async () =>
  (await api.get<SystemCheckItem[]>('/system/check')).data;
export const fetchDataQuality = async () =>
  (await api.get<DataQualityGroup[]>('/system/data-quality')).data;
export const exportUrl = (name: 'customers' | 'invoices' | 'payments') =>
  `/api/v1/system/export/${name}`;
