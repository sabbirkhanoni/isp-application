import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from '../../shared/database/prisma-client.js';

const KEY = 'bkash_sms_hook';

interface Stored {
  tokenHash: string;
  /** Payments received through the hook are recorded in this user's name. */
  userId: string;
  autoMatchByPhone: boolean;
  lastReceivedAt: string | null;
}

export interface HookStatus {
  enabled: boolean;
  autoMatchByPhone: boolean;
  lastReceivedAt: string | null;
}

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

/** The forwarder's secret link: only a hash is kept, the token is shown once when created. */
export class SmsHookStore {
  constructor(private readonly db: Database) {}

  private async read(): Promise<Stored | null> {
    const row = await this.db.systemSetting.findUnique({ where: { key: KEY } });
    const value = row?.valueJson as Partial<Stored> | null | undefined;
    return value?.tokenHash && value.userId
      ? {
          tokenHash: value.tokenHash,
          userId: value.userId,
          autoMatchByPhone: value.autoMatchByPhone ?? true,
          lastReceivedAt: value.lastReceivedAt ?? null,
        }
      : null;
  }

  private async write(value: Stored | null, userId: string): Promise<void> {
    const json = value ?? {};
    await this.db.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, valueJson: json, updatedBy: userId },
      update: { valueJson: json, updatedBy: userId },
    });
  }

  async status(): Promise<HookStatus> {
    const s = await this.read();
    return {
      enabled: s !== null,
      autoMatchByPhone: s?.autoMatchByPhone ?? true,
      lastReceivedAt: s?.lastReceivedAt ?? null,
    };
  }

  /** Creates (or replaces) the token. Returns it once. */
  async enable(userId: string): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    const current = await this.read();
    await this.write(
      {
        tokenHash: hash(token),
        userId,
        autoMatchByPhone: current?.autoMatchByPhone ?? true,
        lastReceivedAt: current?.lastReceivedAt ?? null,
      },
      userId,
    );
    return token;
  }

  async disable(userId: string): Promise<void> {
    await this.write(null, userId);
  }

  async setAutoMatch(value: boolean, userId: string): Promise<void> {
    const current = await this.read();
    if (current) await this.write({ ...current, autoMatchByPhone: value }, userId);
  }

  /** Checks a bearer token; returns what the hook needs, or null. */
  async authenticate(token: string): Promise<{ userId: string; autoMatchByPhone: boolean } | null> {
    const current = await this.read();
    if (!current) return null;
    const expected = Buffer.from(current.tokenHash, 'hex');
    const actual = Buffer.from(hash(token), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return { userId: current.userId, autoMatchByPhone: current.autoMatchByPhone };
  }

  async touch(): Promise<void> {
    const current = await this.read();
    if (current)
      await this.write({ ...current, lastReceivedAt: new Date().toISOString() }, current.userId);
  }
}
