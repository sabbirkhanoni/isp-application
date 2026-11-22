import type { User } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import type { NewUser, UserPatch } from './users.types.js';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(data: NewUser): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User>;
  list(page: number, limit: number): Promise<{ items: User[]; total: number }>;
  countActiveAdmins(): Promise<number>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { username } });
  }

  create(data: NewUser): Promise<User> {
    return this.db.user.create({ data });
  }

  update(id: string, patch: UserPatch): Promise<User> {
    return this.db.user.update({ where: { id }, data: patch });
  }

  async list(page: number, limit: number): Promise<{ items: User[]; total: number }> {
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.user.count(),
    ]);
    return { items, total };
  }

  countActiveAdmins(): Promise<number> {
    return this.db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  }
}
