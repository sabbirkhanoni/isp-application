import type { Language, Role, UserStatus } from '@isp/contracts';

export interface NewUser {
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
}

export interface UserPatch {
  fullName?: string;
  phone?: string | null;
  role?: Role;
  status?: UserStatus;
  language?: Language;
  extraPermissions?: string[];
  passwordHash?: string;
  mustChangePassword?: boolean;
}

/** Port implemented by the auth module's session repository. */
export interface SessionRevoker {
  revokeAllForUser(userId: string, at: Date): Promise<number>;
}
