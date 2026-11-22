import { effectivePermissions, type AuthUserDto } from '@isp/contracts';
import type { User } from '../../generated/prisma/client.js';
import type { AuthContext } from './auth.types.js';

export function toAuthContext(sessionId: string, user: User): AuthContext {
  return {
    sessionId,
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: effectivePermissions(user.role, user.extraPermissions),
    language: user.language,
    mustChangePassword: user.mustChangePassword,
  };
}

export function toAuthUserDto(context: AuthContext): AuthUserDto {
  return {
    id: context.userId,
    username: context.username,
    fullName: context.fullName,
    role: context.role,
    permissions: context.permissions,
    language: context.language,
    mustChangePassword: context.mustChangePassword,
  };
}
