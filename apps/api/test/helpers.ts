import argon2 from 'argon2';
import type { Express } from 'express';
import request from 'supertest';
import { buildServices, type Services } from '../src/composition-root.js';
import {
  RouterError as RouterErrorClass,
  type ApplyOptions,
  type ApplyResult,
  type LiveSession,
  type RouterError,
  type RouterGateway,
  type RouterSecretInfo,
  type RouterTarget,
} from '../src/modules/network/router-gateway.js';
import type { SmsSender } from '../src/modules/notifications/sms-sender.js';
import type { Clock } from '../src/shared/utils/clock.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/shared/database/prisma-client.js';
import { createLogger } from '../src/shared/logger/logger.js';
import { TEST_DATABASE_URL } from './test-config.js';

export const ADMIN = { username: 'owner', password: 'Admin-pass-12345' };
export const STAFF = { username: 'field1', password: 'Staff-pass-12345' };

export class TestClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export class FakeSmsSender implements SmsSender {
  readonly sent: Array<{ phone: string; message: string }> = [];
  failNext = false;
  async send(phone: string, message: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('gateway down');
    }
    this.sent.push({ phone, message });
  }
}

export class FakeRouterGateway implements RouterGateway {
  readonly calls: Array<{
    host: string;
    user: string;
    enabled: boolean;
  }> = [];
  /** Extra detail about each call (profile asked for, whether the account had to be created). */
  readonly applied: Array<{ user: string; profile: string | null; created: boolean }> = [];
  /** Logins that do not exist on the fake router yet. */
  missing = new Set<string>();
  /** What the fake router lists as PPP accounts, by host. */
  secrets: Record<string, RouterSecretInfo[]> = {};
  async listSecrets(target: RouterTarget): Promise<RouterSecretInfo[]> {
    if (this.failWith) throw this.failWith;
    return this.secrets[target.host] ?? [];
  }
  /** Throw this on the next call(s). */
  failWith: RouterError | null = null;
  async setPppoeEnabled(
    target: RouterTarget,
    user: string,
    enabled: boolean,
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    if (this.failWith) throw this.failWith;
    const absent = this.missing.has(user);
    if (absent && !options?.password) {
      throw new RouterErrorClass('SECRET_NOT_FOUND', `PPPoE user "${user}" does not exist`, false);
    }
    if (absent) this.missing.delete(user);
    this.calls.push({ host: target.host, user, enabled });
    this.applied.push({ user, profile: options?.profile ?? null, created: absent });
    return { created: absent };
  }
  /** What the fake router reports as connected, by host. */
  sessions: Record<string, LiveSession[]> = {};
  async listSessions(target: RouterTarget): Promise<LiveSession[]> {
    if (this.failWith) throw this.failWith;
    return this.sessions[target.host] ?? [];
  }
  async ping(): Promise<{ identity: string; version: string }> {
    if (this.failWith) throw this.failWith;
    return { identity: 'fake', version: '7.16' };
  }
  /** Live tools: what the fake router answers, and what was asked of it. */
  pingAnswer = { sent: 4, received: 4, lossPercent: 0, avgMs: 7 };
  rate: { rxBps: number; txBps: number } | null = { rxBps: 2_000_000, txBps: 18_500_000 };
  macLocks: Record<string, string | null> = {};
  readonly kicked: string[] = [];
  readonly pinged: string[] = [];
  async pingFrom(_target: RouterTarget, address: string) {
    if (this.failWith) throw this.failWith;
    this.pinged.push(address);
    return this.pingAnswer;
  }
  async kickSession(_target: RouterTarget, user: string): Promise<number> {
    if (this.failWith) throw this.failWith;
    this.kicked.push(user);
    return 1;
  }
  async liveRate(): Promise<{ rxBps: number; txBps: number } | null> {
    if (this.failWith) throw this.failWith;
    return this.rate;
  }
  async getMacLock(_target: RouterTarget, user: string): Promise<string | null> {
    return this.macLocks[user] ?? null;
  }
  async setMacLock(_target: RouterTarget, user: string, mac: string | null): Promise<void> {
    this.macLocks[user] = mac;
  }
}

export interface TestContext extends Services {
  app: Express;
  clock: TestClock;
  sms: FakeSmsSender;
  router: FakeRouterGateway;
  snmp: FakeSnmpClient;
  db: Database;
  close(): Promise<void>;
}

/** Stands in for the OLTs: tables[column OID] = rows the OLT would answer. */
export class FakeSnmpClient {
  tables: Record<string, Array<{ oid: string; value: unknown }>> = {};
  failWith: Error | null = null;
  async walk(_target: unknown, oid: string) {
    if (this.failWith) throw this.failWith;
    return this.tables[oid] ?? [];
  }
}

export function createTestContext(overrides: Record<string, string> = {}): TestContext {
  const clock = new TestClock(new Date('2026-11-02T04:00:00Z')); // 10:00 on 2 Nov in Dhaka
  const sms = new FakeSmsSender();
  const router = new FakeRouterGateway();
  const snmp = new FakeSnmpClient();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    DB_POOL_MAX: '3',
    ALLOWED_ORIGINS: 'https://app.example.test',
    SESSION_TTL_HOURS: '87600', // the fake clock may sit in the past; keep cookies valid
    LOGIN_RATE_LIMIT_PER_15_MIN: '10000',
    LOGIN_MAX_FAILURES: '3',
    LOGIN_LOCK_MINUTES: '15',
    ROUTER_SECRET: 'test-router-secret-0123456789',
    PROXY_SECRET: 'test-proxy-secret-0123456789',
    ...overrides,
  });
  const db = createDatabase(config.databaseUrl, config.dbPoolMax);
  const services = buildServices({
    config,
    db,
    logger: createLogger(config),
    clock,
    smsSender: sms,
    routerGateway: router,
    snmpClient: snmp,
  });
  return { ...services, db, clock, sms, router, snmp, close: () => db.$disconnect() };
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, expenses, report_runs, network_jobs, routers, bkash_transactions, bkash_import_batches, sms_messages, payment_allocations, payments, invoices, leads, subscriptions, customers, packages, sessions, users, system_settings, olts CASCADE',
  );
  await db.$executeRawUnsafe('ALTER SEQUENCE customer_code_seq RESTART WITH 1');
  await db.$executeRawUnsafe('ALTER SEQUENCE receipt_seq RESTART WITH 1');
}

export async function seedUsers(db: Database): Promise<void> {
  const hash = (password: string) => argon2.hash(password, { type: argon2.argon2id });
  await db.user.createMany({
    data: [
      {
        username: ADMIN.username,
        fullName: 'Owner',
        role: 'ADMIN',
        passwordHash: await hash(ADMIN.password),
      },
      {
        username: STAFF.username,
        fullName: 'Field One',
        role: 'STAFF',
        passwordHash: await hash(STAFF.password),
      },
    ],
  });
}

/** Logs in and returns a supertest agent that carries the session cookie. */
export async function loginAs(app: Express, credentials: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send(credentials);
  if (res.status !== 200) throw new Error(`Login failed in test helper: ${res.status}`);
  return agent;
}
