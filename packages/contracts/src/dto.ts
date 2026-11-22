import type { Language, Role, UserStatus } from './enums.js';
import type { GrantablePermission, Permission } from './permissions.js';

export interface AuthUserDto {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: readonly Permission[];
  language: Language;
  mustChangePassword: boolean;
}

export interface UserDto {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  language: Language;
  /** Extra rights granted to this staff member beyond the role. */
  extraPermissions: GrantablePermission[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}
