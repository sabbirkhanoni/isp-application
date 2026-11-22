import { buildServices } from './composition-root.js';
import { loadConfig } from './config/env.js';
import { startBackgroundJobs } from './modules/billing/background-jobs.js';
import { createDatabase } from './shared/database/prisma-client.js';
import { createLogger } from './shared/logger/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const db = createDatabase(config.databaseUrl, config.dbPoolMax);
const {
  app,
  billing,
  notifications,
  network,
  customerStatus,
  reports,
  sender,
  ownerPhone,
  billingSettings,
  alerts,
  usage,
  olt,
} = buildServices({ config, db, logger });
const stopJobs = config.backgroundJobs
  ? startBackgroundJobs({
      billing,
      notifications,
      network,
      customerStatus,
      reports,
      sender,
      alerts,
      usage,
      olt,
      ownerPhone,
      autoSuspendGraceDays: async () => {
        const { autoSuspend } = await billingSettings.get();
        return autoSuspend.enabled ? autoSuspend.graceDays : null;
      },
      logger,
    })
  : () => undefined;

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  stopJobs();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
