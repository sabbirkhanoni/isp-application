import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SMS_TEMPLATE_MAX_LENGTH, type SmsTemplateDto } from '@isp/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/use-error-message';
import { fetchSmsTemplates, resetSmsTemplate, saveSmsTemplate, smsTemplatesKey } from './admin-api';
import { Loading } from '@/components/ui/page';

function TemplateCard({ item }: { item: SmsTemplateDto }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [text, setText] = useState(item.template);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const label = item.type === 'reminder' ? t.admin.smsReminder : t.admin.smsPaymentReceived;

  const done = () => {
    setMessage({ ok: true, text: t.admin.smsSaved });
    return queryClient.invalidateQueries({ queryKey: smsTemplatesKey });
  };
  const fail = (e: unknown) =>
    setMessage({
      ok: false,
      text: e instanceof ApiError && e.status === 400 ? t.admin.smsBadWord : toMessage(e),
    });
  const save = useMutation({
    mutationFn: () => saveSmsTemplate(item.type, text.trim()),
    onSuccess: done,
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: () => resetSmsTemplate(item.type),
    onSuccess: done,
    onError: fail,
  });

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{label}</h2>
        <span className="text-xs text-slate-500">
          {item.isCustom ? t.admin.smsCustom : t.admin.smsBuiltIn}
        </span>
      </div>
      <textarea
        aria-label={label}
        value={text}
        maxLength={SMS_TEMPLATE_MAX_LENGTH}
        rows={3}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        className="w-full rounded-lg border border-slate-300 bg-surface p-3 text-sm focus-visible:outline-2 focus-visible:outline-brand"
      />
      <p className="text-xs text-slate-500">
        {t.admin.smsPlaceholders}: {item.placeholders.map((p) => `{${p}}`).join('  ')}
      </p>
      <p className="text-xs text-slate-500">{t.admin.smsLength}</p>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <span className="text-xs text-slate-500">{t.admin.smsPreview}: </span>
        {item.preview}
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}
        >
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={save.isPending || text.trim().length < 5 || text.trim() === item.template}
          onClick={() => save.mutate()}
        >
          {t.common.save}
        </Button>
        {item.isCustom && (
          <Button variant="outline" disabled={reset.isPending} onClick={() => reset.mutate()}>
            {t.admin.smsReset}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SmsTemplatesPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: smsTemplatesKey, queryFn: fetchSmsTemplates });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.admin.smsTitle}</h1>
        <p className="text-sm text-slate-600">{t.admin.smsIntro}</p>
      </div>
      {query.isPending && <Loading />}
      {query.isError && <p className="text-red-700">{t.common.genericError}</p>}
      {query.data?.items.map((item) => (
        <TemplateCard key={`${item.type}-${item.template}`} item={item} />
      ))}
    </div>
  );
}
