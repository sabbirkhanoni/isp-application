import type {
  CreateUserInput,
  PaginationMeta,
  ResetPasswordInput,
  UpdateUserInput,
  UserDto,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const usersKeys = {
  list: (page: number) => ['users', 'list', page] as const,
  all: ['users'] as const,
};

export async function fetchUsers(
  page: number,
): Promise<{ users: UserDto[]; pagination: PaginationMeta }> {
  const res = await api.get<UserDto[]>(`/admin/users?page=${page}&limit=20`);
  return { users: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

export const createUser = (input: CreateUserInput) => api.post<UserDto>('/admin/users', input);
export const updateUser = (id: string, input: UpdateUserInput) =>
  api.patch<UserDto>(`/admin/users/${id}`, input);
export const resetUserPassword = (id: string, input: ResetPasswordInput) =>
  api.post(`/admin/users/${id}/reset-password`, input);
