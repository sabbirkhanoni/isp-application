import type { Session, User } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export type SessionWithUser = Session & { user: User };

export interface SessionRepository {
  create(data: NewSession): Promise<Session>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionWithUser | null>;
  touch(id: string, at: Date): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date, exceptSessionId?: string): Promise<number>;
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  create(data: NewSession): Promise<Session> {
    return this.db.session.create({ data });
  }

  findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionWithUser | null> {
    return this.db.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
    });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.session.update({ where: { id }, data: { lastSeenAt: at } });
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeAllForUser(userId: string, at: Date, exceptSessionId?: string): Promise<number> {
    const result = await this.db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: at },
    });
    return result.count;
  }
}
