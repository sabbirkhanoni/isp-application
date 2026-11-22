import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import type { Logger } from '../../shared/logger/logger.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { SmsSender } from '../notifications/sms-sender.js';

const KEY = 'alert_state';
/** A router silent for this long is reported as down (the line poll runs every minute). */
export const ROUTER_DOWN_AFTER_MS = 10 * 60_000;
/** Many customers dropping at once usually means a fault upstream, not a customer problem. */
export const MASS_DROP_MIN_LINES = 10;
export const MASS_DROP_RATIO = 0.5;
const MASS_DROP_COOLDOWN_MS = 60 * 60_000;

interface RouterState {
  down: boolean;
  lastOnline: number | null;
  massDropAt: string | null;
}
type AlertState = Record<string, RouterState>;

/**
 * Tells the owner by SMS when a router stops answering, when it comes back, and when a large share of its
 * customers drop offline at once. State is kept in system_settings so a restart (the free server sleeps)
 * never repeats an alert; each situation is reported once, with a recovery message.
 */
export class AlertService {
  constructor(
    private readonly db: Database,
    private readonly sender: SmsSender,
    private readonly ownerPhone: string | null,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  private async load(): Promise<AlertState> {
    const row = await this.db.systemSetting.findUnique({ where: { key: KEY } });
    return (row?.valueJson ?? {}) as unknown as AlertState;
  }

  private async save(state: AlertState): Promise<void> {
    const json = state as unknown as Prisma.InputJsonValue;
    await this.db.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, valueJson: json },
      update: { valueJson: json },
    });
  }

  private async notify(text: string): Promise<void> {
    if (!this.ownerPhone) return;
    try {
      await this.sender.send(this.ownerPhone, text);
    } catch (error) {
      this.logger.warn({ err: error }, 'Owner alert SMS failed');
      throw error;
    }
  }

  /** Returns how many alerts were sent. Safe to call every minute. */
  async check(): Promise<number> {
    if (!this.ownerPhone) return 0;
    const now = this.clock.now();
    const routers = await this.db.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, lastSeenAt: true, createdAt: true },
    });
    const online = await this.db.lineStatus.groupBy({
      by: ['routerId'],
      where: { online: true },
      _count: { _all: true },
    });
    const onlineBy = new Map(online.map((o) => [o.routerId, o._count._all]));
    const state = await this.load();
    let sent = 0;

    for (const router of routers) {
      const previous = state[router.id] ?? { down: false, lastOnline: null, massDropAt: null };
      const next: RouterState = { ...previous };
      const seen = router.lastSeenAt ?? router.createdAt;
      const silent = now.getTime() - seen.getTime() > ROUTER_DOWN_AFTER_MS;

      try {
        if (silent && !previous.down) {
          await this.notify(`ALERT: Router "${router.name}" is not responding.`);
          next.down = true;
          sent += 1;
        } else if (!silent && previous.down) {
          await this.notify(`OK: Router "${router.name}" is back online.`);
          next.down = false;
          sent += 1;
        }

        const count = onlineBy.get(router.id) ?? 0;
        if (!silent) {
          const was = previous.lastOnline;
          const cooled =
            !previous.massDropAt ||
            now.getTime() - new Date(previous.massDropAt).getTime() > MASS_DROP_COOLDOWN_MS;
          if (
            was !== null &&
            was >= MASS_DROP_MIN_LINES &&
            count < was * MASS_DROP_RATIO &&
            cooled
          ) {
            await this.notify(
              `ALERT: ${router.name}: online customers fell from ${was} to ${count}. Please check the line/power.`,
            );
            next.massDropAt = now.toISOString();
            sent += 1;
          }
          next.lastOnline = count;
        }
      } catch {
        // Keep the old state for this router so the alert is retried on the next tick.
        continue;
      }
      state[router.id] = next;
    }
    await this.save(state);
    return sent;
  }
}
