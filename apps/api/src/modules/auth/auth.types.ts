import type { Language, Permission, Role } from '@isp/contracts';

export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  permissions: readonly Permission[];
  language: Language;
  mustChangePassword: boolean;
}

/** Request-scoped facts that services need for audit and session records. */
export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}
