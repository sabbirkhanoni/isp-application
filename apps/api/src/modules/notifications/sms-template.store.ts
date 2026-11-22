import type { Language, SmsTemplateType } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';
import type { DbTransaction } from '../../shared/database/transaction.js';

const KEY = 'sms_templates';
export type CustomTemplates = Partial<Record<SmsTemplateType, string>>;
type Stored = Partial<Record<Language, CustomTemplates>>;

/** Admin-edited SMS texts, kept in system_settings. Missing entries mean "use the built-in text". */
export class SmsTemplateStore {
  constructor(private readonly db: Database) {}

  private async readAll(reader: Database | DbTransaction): Promise<Stored> {
    const row = await reader.systemSetting.findUnique({ where: { key: KEY } });
    return row && typeof row.valueJson === 'object' && row.valueJson !== null
      ? (row.valueJson as Stored)
      : {};
  }

  /** Pass a transaction when the caller is already inside one. */
  async customFor(locale: Language, reader: Database | DbTransaction = this.db) {
    return (await this.readAll(reader))[locale] ?? {};
  }

  /** `template === null` removes the custom text (back to the built-in one). */
  async save(
    locale: Language,
    type: SmsTemplateType,
    template: string | null,
    userId: string,
  ): Promise<void> {
    const all = await this.readAll(this.db);
    const current = { ...(all[locale] ?? {}) };
    if (template === null) delete current[type];
    else current[type] = template;
    const next: Stored = { ...all, [locale]: current };
    await this.db.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, valueJson: next, updatedBy: userId },
      update: { valueJson: next, updatedBy: userId },
    });
  }
}
