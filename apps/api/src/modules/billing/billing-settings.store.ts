import type { BillingSettings } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';

const KEY = 'billing_settings';

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  prorateNewCustomers: false,
  business: { name: 'Internet Service', address: '', phone: '', footer: '' },
  autoSuspend: { enabled: false, graceDays: 3 },
};

/** Billing switches and the business details printed on receipts, kept in system_settings. */
export class BillingSettingsStore {
  constructor(
    private readonly db: Database,
    /** Used until the owner saves their own choice (the old AUTO_SUSPEND environment switch). */
    private readonly autoSuspendDefault: BillingSettings['autoSuspend'] = DEFAULT_BILLING_SETTINGS.autoSuspend,
  ) {}

  async get(): Promise<BillingSettings> {
    const row = await this.db.systemSetting.findUnique({ where: { key: KEY } });
    const stored = (row?.valueJson ?? {}) as Partial<BillingSettings>;
    return {
      prorateNewCustomers:
        stored.prorateNewCustomers ?? DEFAULT_BILLING_SETTINGS.prorateNewCustomers,
      business: { ...DEFAULT_BILLING_SETTINGS.business, ...(stored.business ?? {}) },
      autoSuspend: stored.autoSuspend ?? this.autoSuspendDefault,
    };
  }

  async save(settings: BillingSettings, userId: string): Promise<void> {
    await this.db.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, valueJson: settings, updatedBy: userId },
      update: { valueJson: settings, updatedBy: userId },
    });
  }
}
