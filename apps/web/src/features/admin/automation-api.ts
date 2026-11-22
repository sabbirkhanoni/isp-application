import type { BroadcastInput, BroadcastPreviewDto, BroadcastResultDto } from '@isp/contracts';
import { api } from '@/lib/api-client';

export interface BkashHookStatus {
  enabled: boolean;
  autoMatchByPhone: boolean;
  lastReceivedAt: string | null;
}

export const bkashHookKey = ['bkash-hook'] as const;

export const fetchBkashHook = async () => (await api.get<BkashHookStatus>('/bkash/hook')).data;
export const enableBkashHook = async () =>
  (await api.post<{ token: string }>('/bkash/hook/enable', {})).data.token;
export const disableBkashHook = () => api.post<{ ok: true }>('/bkash/hook/disable', {});
export const setBkashAutoMatch = (autoMatchByPhone: boolean) =>
  api.put<{ ok: true }>('/bkash/hook/auto-match', { autoMatchByPhone });

export const previewBroadcast = async (input: BroadcastInput) =>
  (await api.post<BroadcastPreviewDto>('/sms-broadcast/preview', input)).data;
export const sendBroadcast = async (input: BroadcastInput) =>
  (await api.post<BroadcastResultDto>('/sms-broadcast', input)).data;
