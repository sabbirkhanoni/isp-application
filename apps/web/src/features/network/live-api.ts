import type { KickResultDto, LiveTrafficDto, MacLockDto, PingResultDto } from '@isp/contracts';
import { api } from '@/lib/api-client';

const base = (customerId: string) => `/network/lines/customer/${customerId}`;

export const pingLine = async (customerId: string) =>
  (await api.post<PingResultDto>(`${base(customerId)}/ping`)).data;
export const kickLine = async (customerId: string) =>
  (await api.post<KickResultDto>(`${base(customerId)}/kick`)).data;
export const fetchTraffic = async (customerId: string) =>
  (await api.get<LiveTrafficDto>(`${base(customerId)}/traffic`)).data;
export const fetchMac = async (customerId: string) =>
  (await api.get<MacLockDto>(`${base(customerId)}/mac`)).data;
export const lockMac = async (customerId: string, mac?: string) =>
  (await api.post<MacLockDto>(`${base(customerId)}/mac/lock`, mac ? { mac } : {})).data;
export const resetMac = async (customerId: string) =>
  (await api.post<MacLockDto>(`${base(customerId)}/mac/reset`)).data;
