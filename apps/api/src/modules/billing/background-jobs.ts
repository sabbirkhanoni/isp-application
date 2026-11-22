import type { Logger } from '../../shared/logger/logger.js';
import type { UsageService } from '../usage/usage.service.js';
import type { OltService } from '../olt/olt.service.js';
import type { AlertService } from '../alerts/alert.service.js';
import type { CustomerStatusService } from '../customers/customer-status.service.js';
import type { SmsSender } from '../notifications/sms-sender.js';
import type { ReportsService } from '../reports/reports.service.js';
import type { NetworkService } from '../network/network.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { BillingService } from './billing.service.js';

const TICK_MS = 5 * 60_000;
/** Router jobs run on a faster beat so a suspension takes effect within about a minute. */
const ROUTER_TICK_MS = 30_000;
/** How often the live line status is refreshed from the routers. */
const SESSION_TICK_MS = 60_000;
/** Fiber signals change slowly and an OLT walk is heavy, so every 5 minutes is plenty. */
const OLT_TICK_MS = 5 * 60_000;

/**
 * In-process scheduler (no separate worker service). Every tick it does idempotent "catch-up" work,
 * so it does not matter that the free Render instance sleeps and wakes: whatever was missed is done
 * on the next tick. Each step is safe to repeat (database unique indexes prevent duplicates).
 */
export function startBackgroundJobs(deps: {
  billing: BillingService;
  notifications: NotificationService;
  network: NetworkService;
  customerStatus: CustomerStatusService;
  reports: ReportsService;
  sender: SmsSender;
  alerts: AlertService;
  usage: UsageService;
  olt: OltService;
  /** null = no monthly summary SMS. */
  ownerPhone: string | null;
  /** Read every tick so the owner's setting applies without a restart. null = automatic suspension is off. */
  autoSuspendGraceDays: () => Promise<number | null>;
  logger: Logger;
}): () => void {
  const {
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
    autoSuspendGraceDays,
    logger,
  } = deps;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const invoices = await billing.generateForPeriod();
      const queued = await notifications.enqueueReminders();
      const graceDays = await autoSuspendGraceDays();
      const suspended = graceDays === null ? 0 : await customerStatus.autoSuspendOverdue(graceDays);
      const sms = await notifications.dispatchPending();
      const digest = await reports.sendMonthlyDigest(sender, ownerPhone).catch((error: unknown) => {
        logger.error({ err: error }, 'Monthly summary SMS failed; will retry');
        return null;
      });
      if (digest) logger.info({ period: digest }, 'Monthly summary sent to the owner');
      logger.info(
        { invoicesCreated: invoices.created, remindersQueued: queued, suspended, sms },
        'Background tick',
      );
    } catch (error) {
      logger.error({ err: error }, 'Background tick failed');
    } finally {
      running = false;
    }
  };

  let routerRunning = false;
  const routerTick = async (): Promise<void> => {
    if (routerRunning) return;
    routerRunning = true;
    try {
      const summary = await network.runDue();
      if (summary.done + summary.retried + summary.failed > 0) {
        logger.info({ routerJobs: summary }, 'Router jobs processed');
      }
    } catch (error) {
      logger.error({ err: error }, 'Router job run failed');
    } finally {
      routerRunning = false;
    }
  };

  let sessionsRunning = false;
  const sessionTick = async (): Promise<void> => {
    if (sessionsRunning) return;
    sessionsRunning = true;
    try {
      const summary = await network.pollSessions();
      await usage.pruneOld();
      const alertsSent = await alerts.check();
      if (alertsSent > 0) logger.warn({ alertsSent }, 'Owner alerts sent');
      if (summary.failed > 0)
        logger.warn({ lineMonitor: summary }, 'Some routers were unreachable');
    } catch (error) {
      logger.error({ err: error }, 'Line monitoring failed');
    } finally {
      sessionsRunning = false;
    }
  };

  let oltRunning = false;
  const oltTick = async (): Promise<void> => {
    if (oltRunning) return;
    oltRunning = true;
    try {
      const summary = await olt.pollAll();
      if (summary.failed > 0) logger.warn({ olt: summary }, 'Some OLTs could not be read');
    } catch (error) {
      logger.error({ err: error }, 'OLT polling failed');
    } finally {
      oltRunning = false;
    }
  };

  void tick().then(routerTick).then(sessionTick).then(oltTick);
  const timer = setInterval(() => void tick(), TICK_MS);
  const routerTimer = setInterval(() => void routerTick(), ROUTER_TICK_MS);
  const sessionTimer = setInterval(() => void sessionTick(), SESSION_TICK_MS);
  const oltTimer = setInterval(() => void oltTick(), OLT_TICK_MS);
  return () => {
    clearInterval(oltTimer);
    clearInterval(sessionTimer);
    clearInterval(timer);
    clearInterval(routerTimer);
  };
}
