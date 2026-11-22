import type { CustomerUsageDto, TopUsageRowDto } from '@isp/contracts';
import type { Clock } from '../../shared/utils/clock.js';
import { currentPeriod, dhakaToday, periodStart } from '../../shared/utils/dhaka-time.js';
import type { UsageRepository } from './usage.repository.js';

const KEEP_MONTHS = 13;

const monthStart = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1));
const label = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export class UsageService {
  private lastPruneDay: string | null = null;

  constructor(
    private readonly repo: UsageRepository,
    private readonly clock: Clock,
  ) {}

  /** The last `months` calendar months (Dhaka), newest first. */
  async forCustomer(customerId: string, months = 6): Promise<CustomerUsageDto> {
    const today = dhakaToday(this.clock.now());
    const list = Array.from({ length: months }, (_, i) =>
      monthStart(today.getUTCFullYear(), today.getUTCMonth() - i),
    );
    const oldest = list[list.length - 1] as Date;
    const rows = await this.repo.customerMonths(customerId, oldest);
    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    const result = list.map((d) => {
      const r = byPeriod.get(label(d));
      return {
        period: label(d),
        downloadBytes: Number(r?.download ?? 0n),
        uploadBytes: Number(r?.upload ?? 0n),
      };
    });
    const noData = rows.length === 0 && !(await this.repo.hasPppoe(customerId));
    return { months: result, noData };
  }

  top(period: string | undefined, limit: number): Promise<TopUsageRowDto[]> {
    const first = periodStart(period ?? currentPeriod(this.clock.now()));
    const next = monthStart(first.getUTCFullYear(), first.getUTCMonth() + 1);
    return this.repo.top(first, next, limit);
  }

  /** Once per day: forget traffic older than a year. Cheap to call on every tick. */
  async pruneOld(): Promise<number> {
    const today = dhakaToday(this.clock.now());
    const key = today.toISOString().slice(0, 10);
    if (this.lastPruneDay === key) return 0;
    this.lastPruneDay = key;
    return this.repo.prune(monthStart(today.getUTCFullYear(), today.getUTCMonth() - KEEP_MONTHS));
  }
}
