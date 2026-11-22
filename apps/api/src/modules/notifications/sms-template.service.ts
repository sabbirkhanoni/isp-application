import {
  SMS_PLACEHOLDERS,
  SMS_TEMPLATE_TYPES,
  unknownPlaceholders,
  type Language,
  type SmsTemplateDto,
  type SmsTemplatesDto,
  type SmsTemplateType,
} from '@isp/contracts';
import { ValidationError } from '../../shared/errors/app-error.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { SmsTemplateStore } from './sms-template.store.js';
import { DEFAULT_TEMPLATES, renderTemplate } from './sms-templates.js';

const SAMPLE: Record<Language, Record<string, string>> = {
  bn: {
    name: 'করিম সাহেব',
    amountDue: '800',
    dueDate: '১০ নভেম্বর',
    amount: '800',
    receipt: 'R000123',
    remaining: '0',
  },
  en: {
    name: 'Karim',
    amountDue: '800',
    dueDate: '10 November',
    amount: '800',
    receipt: 'R000123',
    remaining: '0',
  },
};

export class SmsTemplateService {
  constructor(
    private readonly store: SmsTemplateStore,
    private readonly audit: AuditRecorder,
    private readonly locale: Language,
  ) {}

  async list(): Promise<SmsTemplatesDto> {
    const custom = await this.store.customFor(this.locale);
    const items: SmsTemplateDto[] = SMS_TEMPLATE_TYPES.map((type) => {
      const defaultTemplate = DEFAULT_TEMPLATES[this.locale][type];
      const template = custom[type] ?? defaultTemplate;
      return {
        type,
        template,
        defaultTemplate,
        isCustom: custom[type] !== undefined,
        placeholders: SMS_PLACEHOLDERS[type],
        preview: renderTemplate(template, SAMPLE[this.locale]),
      };
    });
    return { locale: this.locale, items };
  }

  async update(
    actor: AuthContext,
    type: SmsTemplateType,
    template: string,
    ctx: RequestContext,
  ): Promise<SmsTemplatesDto> {
    const unknown = unknownPlaceholders(type, template);
    if (unknown.length > 0) {
      throw new ValidationError('Validation failed.', [
        {
          path: 'template',
          message: `Unknown placeholder: ${unknown.map((w) => `{${w}}`).join(', ')}`,
        },
      ]);
    }
    await this.store.save(this.locale, type, template, actor.userId);
    await this.record(actor, ctx, AUDIT_ACTIONS.SMS_TEMPLATE_UPDATED, type);
    return this.list();
  }

  async reset(actor: AuthContext, type: SmsTemplateType, ctx: RequestContext) {
    await this.store.save(this.locale, type, null, actor.userId);
    await this.record(actor, ctx, AUDIT_ACTIONS.SMS_TEMPLATE_RESET, type);
    return this.list();
  }

  private record(
    actor: AuthContext,
    ctx: RequestContext,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    type: SmsTemplateType,
  ) {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'sms_template',
      targetId: type,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
    });
  }
}
