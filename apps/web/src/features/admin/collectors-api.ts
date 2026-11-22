import type {
  AssignCollectorInput,
  AssignedCollectorRowDto,
  CollectorOverviewDto,
  SetTargetInput,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const collectorsKey = ['collectors'] as const;
export const fetchCollectorOverview = async (period: string) =>
  (await api.get<CollectorOverviewDto>(`/collectors/overview${period ? `?period=${period}` : ''}`))
    .data;
export const fetchMyCollection = async () =>
  (await api.get<AssignedCollectorRowDto | null>('/collectors/mine')).data;
export const setCollectorTarget = (input: SetTargetInput) =>
  api.put<{ ok: true }>('/collectors/targets', input);
export const assignCollector = async (input: AssignCollectorInput) =>
  (await api.post<{ updated: number }>('/collectors/assign', input)).data;
