import type { Language } from '@isp/contracts';
import type { User } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

export interface CredentialRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  incrementFailedLogins(id: string): Promise<number>;
  lockUntil(id: string, until: Date): Promise<void>;
  recordSuccessfulLogin(id: string, at: Date): Promise<void>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  updateLanguage(id: string, language: Language): Promise<void>;
}

export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly db: Database) {}

  findByUsername(username: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async incrementFailedLogins(id: string): Promise<number> {
    const user = await this.db.user.update({
      where: { id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return user.failedLoginCount;
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await this.db.user.update({ where: { id }, data: { lockedUntil: until } });
  }

  async recordSuccessfulLogin(id: string, at: Date): Promise<void> {
    await this.db.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: at },
    });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  async updateLanguage(id: string, language: Language): Promise<void> {
    await this.db.user.update({ where: { id }, data: { language } });
  }
}
