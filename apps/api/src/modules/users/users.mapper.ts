import { GRANTABLE_PERMISSIONS, type UserDto } from '@isp/contracts';
import type { User } from '../../generated/prisma/client.js';

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    language: user.language,
    extraPermissions: GRANTABLE_PERMISSIONS.filter((p) => user.extraPermissions.includes(p)),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
