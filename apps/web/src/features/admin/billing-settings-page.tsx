import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingSettings } from '@isp/contracts';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  billingSettingsKey,
  fetchBillingSettings,
  saveBillingSettings,
} from '@/features/billing/billing-api';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { Loading } from '@/components/ui/page';

export function BillingSettingsPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: billingSettingsKey, queryFn: fetchBillingSettings });
  const [draft, setDraft] = useState<BillingSettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (value: BillingSettings) => saveBillingSettings(value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: billingSettingsKey });
      setMessage({ ok: true, text: t.extras.settingsSaved });
    },
    onError: (e) => setMessage({ ok: false, text: toMessage(e) }),
  });

  if (!draft) return <Loading />;
  const setBusiness = (patch: Partial<BillingSettings['business']>) =>
    setDraft({ ...draft, business: { ...draft.business, ...patch } });

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.extras.settingsTitle}</h1>
        <p className="text-sm text-slate-600">{t.extras.settingsIntro}</p>
      </div>
      <Card className="space-y-3">
        <Field label={t.extras.businessName} htmlFor="biz-name">
          <Input
            id="biz-name"
            value={draft.business.name}
            onChange={(e) => setBusiness({ name: e.target.value })}
          />
        </Field>
        <Field label={t.extras.businessAddress} htmlFor="biz-address">
          <Input
            id="biz-address"
            value={draft.business.address}
            onChange={(e) => setBusiness({ address: e.target.value })}
          />
        </Field>
        <Field label={t.extras.businessPhone} htmlFor="biz-phone">
          <Input
            id="biz-phone"
            value={draft.business.phone}
            onChange={(e) => setBusiness({ phone: e.target.value })}
          />
        </Field>
        <Field label={t.extras.businessFooter} htmlFor="biz-footer">
          <Input
            id="biz-footer"
            value={draft.business.footer}
            onChange={(e) => setBusiness({ footer: e.target.value })}
          />
        </Field>
      </Card>
      <Card className="space-y-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={draft.prorateNewCustomers}
            onChange={(e) => setDraft({ ...draft, prorateNewCustomers: e.target.checked })}
          />
          <span>
            <span className="font-medium">{t.extras.prorateLabel}</span>
            <span className="block text-xs text-slate-500">{t.extras.prorateHint}</span>
          </span>
        </label>
      </Card>
      <Card className="space-y-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={draft.autoSuspend.enabled}
            onChange={(e) =>
              setDraft({
                ...draft,
                autoSuspend: { ...draft.autoSuspend, enabled: e.target.checked },
              })
            }
          />
          <span>
            <span className="font-medium">{t.automation.autoSuspendLabel}</span>
            <span className="block text-xs text-slate-500">{t.automation.autoSuspendHint}</span>
          </span>
        </label>
        {draft.autoSuspend.enabled && (
          <Field label={t.automation.graceDays} htmlFor="grace-days">
            <Input
              id="grace-days"
              type="number"
              min={0}
              max={60}
              value={draft.autoSuspend.graceDays}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  autoSuspend: {
                    ...draft.autoSuspend,
                    graceDays: Math.min(60, Math.max(0, Number(e.target.value) || 0)),
                  },
                })
              }
            />
          </Field>
        )}
      </Card>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}
        >
          {message.text}
        </p>
      )}
      <Button
        disabled={save.isPending || draft.business.name.trim().length < 2}
        onClick={() => save.mutate(draft)}
      >
        {t.common.save}
      </Button>
    </div>
  );
}
