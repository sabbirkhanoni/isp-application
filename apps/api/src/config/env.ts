import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_COOKIE_NAME: z.string().min(1).default('sid'),
  COOKIE_SECURE: booleanString.optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  ALLOWED_ORIGINS: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().min(1).default(20),
  BACKGROUND_JOBS: booleanString.default(false),
  SMS_DRIVER: z.enum(['log', 'http']).default('log'),
  /** Owner's mobile number: gets last month's summary by SMS on the 1st. Empty = off. */
  OWNER_PHONE: z
    .string()
    .trim()
    .regex(/^(\+?88)?01\d{9}$/, 'Use a Bangladesh mobile number')
    .optional()
    .or(z.literal('')),
  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().max(20).optional(),
  SMS_MONTHLY_CAP: z.coerce.number().int().min(0).default(5000),
  SMS_LOCALE: z.enum(['bn', 'en']).default('bn'),
  PROXY_SECRET: z.string().min(16).optional(),
  ROUTER_SECRET: z.string().min(16).optional(),
  ROUTER_DRY_RUN: booleanString.default(false),
  AUTO_SUSPEND: booleanString.default(false),
  AUTO_SUSPEND_GRACE_DAYS: z.coerce.number().int().min(0).max(60).default(3),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  logLevel: string;
  sessionCookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  allowedOrigins: readonly string[];
  trustProxyHops: number;
  proxySecret?: string;
  loginMaxFailures: number;
  loginLockMinutes: number;
  loginRateLimitPer15Min: number;
  backgroundJobs: boolean;
  network: {
    routerSecret?: string;
    dryRun: boolean;
    autoSuspend: boolean;
    graceDays: number;
  };
  sms: {
    driver: 'log' | 'http';
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    monthlyCap: number;
    locale: 'bn' | 'en';
  };
  /** null = no monthly summary SMS. */
  ownerPhone: string | null;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const env = parsed.data;
  const cookieSecure = env.COOKIE_SECURE ?? env.NODE_ENV === 'production';

  if (env.SESSION_COOKIE_NAME.startsWith('__Host-') && !cookieSecure) {
    throw new Error(
      'Invalid environment configuration: __Host- cookies require COOKIE_SECURE=true',
    );
  }

  if (env.SMS_DRIVER === 'http' && (!env.SMS_API_URL || !env.SMS_API_KEY)) {
    throw new Error(
      'Invalid environment configuration: SMS_DRIVER=http needs SMS_API_URL and SMS_API_KEY',
    );
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: env.DB_POOL_MAX,
    logLevel: env.LOG_LEVEL,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    cookieSecure,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxyHops: env.TRUST_PROXY_HOPS,
    ...(env.PROXY_SECRET ? { proxySecret: env.PROXY_SECRET } : {}),
    loginMaxFailures: env.LOGIN_MAX_FAILURES,
    loginLockMinutes: env.LOGIN_LOCK_MINUTES,
    loginRateLimitPer15Min: env.LOGIN_RATE_LIMIT_PER_15_MIN,
    backgroundJobs: env.BACKGROUND_JOBS,
    network: {
      ...(env.ROUTER_SECRET ? { routerSecret: env.ROUTER_SECRET } : {}),
      dryRun: env.ROUTER_DRY_RUN,
      autoSuspend: env.AUTO_SUSPEND,
      graceDays: env.AUTO_SUSPEND_GRACE_DAYS,
    },
    sms: {
      driver: env.SMS_DRIVER,
      ...(env.SMS_API_URL ? { apiUrl: env.SMS_API_URL } : {}),
      ...(env.SMS_API_KEY ? { apiKey: env.SMS_API_KEY } : {}),
      ...(env.SMS_SENDER_ID ? { senderId: env.SMS_SENDER_ID } : {}),
      monthlyCap: env.SMS_MONTHLY_CAP,
      locale: env.SMS_LOCALE,
    },
    ownerPhone: env.OWNER_PHONE ? env.OWNER_PHONE : null,
  };
}
