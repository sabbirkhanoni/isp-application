import type { Logger } from '../../shared/logger/logger.js';

export interface RouterTarget {
  host: string;
  port: number;
  useTls: boolean;
  allowSelfSigned: boolean;
  username: string;
  password: string;
}

/** One live PPPoE session as the router reports it. `uptime` is RouterOS text such as "1d2h3m4s". */
export interface LiveSession {
  name: string;
  address: string | null;
  callerId: string | null;
  uptime: string | null;
  /** Session byte counters when the router exposes them (rx = from the customer, tx = to the customer). */
  rxBytes?: number | null;
  txBytes?: number | null;
}

/** What to apply besides on/off. */
export interface ApplyOptions {
  /** PPP profile (speed plan) the account should use; null = leave as is. */
  profile: string | null;
  /** Used only when the account does not exist yet; an existing account's password is never touched. */
  password: string | null;
}

export interface ApplyResult {
  /** true = the account did not exist and was created. */
  created: boolean;
}

export interface RouterSecretInfo {
  name: string;
  profile: string | null;
  disabled: boolean;
}

export interface PingResult {
  sent: number;
  received: number;
  lossPercent: number;
  /** Average round trip in milliseconds; null when nothing came back. */
  avgMs: number | null;
}

/** Current speed of one live session in bits per second (rx = from the customer, tx = to the customer). */
export interface LiveRate {
  rxBps: number;
  txBps: number;
}

export type RouterErrorCode = 'UNREACHABLE' | 'AUTH_FAILED' | 'SECRET_NOT_FOUND' | 'ROUTER_ERROR';

/** `retryable` tells the queue whether trying again later can help. */
export class RouterError extends Error {
  constructor(
    readonly code: RouterErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Port between the billing system and a router. Drivers: RouterOS REST (direct) and a log-only
 * driver for dry runs. The "agent" driver does not use this port: the agent runs the same operation
 * inside the ISP network and reports back.
 */
export interface RouterGateway {
  /**
   * Makes the PPPoE account match: on/off, profile, and creates it when missing (and a password is given).
   * Disabling or changing the profile also drops the live session so it takes effect now.
   */
  setPppoeEnabled(
    target: RouterTarget,
    pppoeUsername: string,
    enabled: boolean,
    options?: ApplyOptions,
  ): Promise<ApplyResult>;
  /** All PPP accounts on the router (read-only). */
  listSecrets(target: RouterTarget): Promise<RouterSecretInfo[]>;
  /** Everyone currently connected over PPPoE (read-only). */
  listSessions(target: RouterTarget): Promise<LiveSession[]>;
  /** Pings `address` from the router itself (so the result is what the customer's line really does). */
  pingFrom(target: RouterTarget, address: string, count: number): Promise<PingResult>;
  /** Drops the live session(s) of this login; the customer's router reconnects by itself. Returns how many were dropped. */
  kickSession(target: RouterTarget, pppoeUsername: string): Promise<number>;
  /** Current speed of the live session; null when the customer is not connected. */
  liveRate(target: RouterTarget, pppoeUsername: string): Promise<LiveRate | null>;
  /** The MAC address (caller-id) the account is locked to; null = not locked. */
  getMacLock(target: RouterTarget, pppoeUsername: string): Promise<string | null>;
  /** Locks the account to `mac`, or removes the lock when `mac` is null. */
  setMacLock(target: RouterTarget, pppoeUsername: string, mac: string | null): Promise<void>;
  /** Cheap read used by "test connection". */
  ping(target: RouterTarget): Promise<{ identity: string; version: string }>;
}

/** Dry-run driver: records what would have happened and touches nothing. */
export class LogRouterGateway implements RouterGateway {
  /** `reader` serves read-only calls, so line monitoring can be tried safely while changes are only logged. */
  constructor(
    private readonly logger: Logger,
    private readonly reader?: RouterGateway,
  ) {}

  async listSessions(target: RouterTarget): Promise<LiveSession[]> {
    return this.reader ? this.reader.listSessions(target) : [];
  }

  async setPppoeEnabled(
    target: RouterTarget,
    user: string,
    enabled: boolean,
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    this.logger.info(
      { router: target.host, pppoeUser: user, enabled, profile: options?.profile ?? null },
      'DRY RUN: router change',
    );
    return { created: false };
  }

  async listSecrets(target: RouterTarget): Promise<RouterSecretInfo[]> {
    return this.reader ? this.reader.listSecrets(target) : [];
  }

  async ping(): Promise<{ identity: string; version: string }> {
    return { identity: 'dry-run', version: 'n/a' };
  }

  /** Read-only calls pass through to the real driver; the one change (kick / MAC lock) is only logged. */
  async pingFrom(target: RouterTarget, address: string, count: number): Promise<PingResult> {
    if (!this.reader) return { sent: count, received: count, lossPercent: 0, avgMs: 1 };
    return this.reader.pingFrom(target, address, count);
  }

  async liveRate(target: RouterTarget, user: string): Promise<LiveRate | null> {
    return this.reader ? this.reader.liveRate(target, user) : { rxBps: 0, txBps: 0 };
  }

  async getMacLock(target: RouterTarget, user: string): Promise<string | null> {
    return this.reader ? this.reader.getMacLock(target, user) : null;
  }

  async kickSession(target: RouterTarget, user: string): Promise<number> {
    this.logger.info({ router: target.host, pppoeUser: user }, 'DRY RUN: kick session');
    return 0;
  }

  async setMacLock(target: RouterTarget, user: string, mac: string | null): Promise<void> {
    this.logger.info({ router: target.host, pppoeUser: user, mac }, 'DRY RUN: MAC lock change');
  }
}

const UNIT_SECONDS: Record<string, number> = { w: 604_800, d: 86_400, h: 3_600, m: 60, s: 1 };

/** Converts RouterOS durations ("1w2d3h4m5s", "45m10s") to seconds; null when unreadable. */
export function parseRouterOsUptime(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = [...text.matchAll(/(\d+)([wdhms])/g)];
  if (matches.length === 0 || matches.map((m) => m[0]).join('') !== text) return null;
  return matches.reduce((sum, m) => sum + Number(m[1]) * (UNIT_SECONDS[m[2] as string] ?? 0), 0);
}
