import type { AuditLogDto, PaginationMeta, SmsTemplatesDto, SmsTemplateType } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const smsTemplatesKey = ['sms-templates'] as const;
export const auditKey = ['audit-logs'] as const;

export const fetchSmsTemplates = async () =>
  (await api.get<SmsTemplatesDto>('/sms-templates')).data;
export const saveSmsTemplate = (type: SmsTemplateType, template: string) =>
  api.put<SmsTemplatesDto>(`/sms-templates/${type}`, { template });
export const resetSmsTemplate = (type: SmsTemplateType) =>
  api.delete<SmsTemplatesDto>(`/sms-templates/${type}`);

export interface AuditFilters {
  group: 'all' | 'logins' | 'denied';
  from: string;
  to: string;
  page: number;
}

export async function fetchAudit(filters: AuditFilters) {
  const query = new URLSearchParams({
    group: filters.group,
    page: String(filters.page),
    limit: '30',
  });
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  const res = await api.get<AuditLogDto[]>(`/audit-logs?${query}`);
  return { items: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}
