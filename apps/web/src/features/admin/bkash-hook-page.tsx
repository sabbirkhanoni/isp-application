import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  bkashHookKey,
  disableBkashHook,
  enableBkashHook,
  fetchBkashHook,
  setBkashAutoMatch,
} from './automation-api';
import { Loading } from '@/components/ui/page';

export function BkashHookPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: bkashHookKey, queryFn: fetchBkashHook });
  // The secret is shown only right after it is created; the server keeps just a hash.
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: bkashHookKey });
  const onError = (e: unknown) => setError(toMessage(e));

  const enable = useMutation({
    mutationFn: enableBkashHook,
    onSuccess: async (value) => {
      setError(null);
      setToken(value);
      await refresh();
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: disableBkashHook,
    onSuccess: async () => {
      setToken(null);
      await refresh();
    },
    onError,
  });
  const autoMatch = useMutation({
    mutationFn: setBkashAutoMatch,
    onSuccess: refresh,
    onError,
  });

  if (!query.data) return <Loading />;
  const status = query.data;
  const url = `${window.location.origin}/api/v1/hooks/bkash-sms`;
  const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.automation.hookTitle}</h1>
        <p className="text-sm text-slate-600">{t.automation.hookIntro}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Card className="space-y-3">
        <p className="text-sm">
          {status.enabled ? t.automation.hookOn : t.automation.hookOff}
          {status.enabled && (
            <span className="block text-xs text-slate-500">
              {status.lastReceivedAt
                ? `${t.automation.lastReceived}: ${new Date(status.lastReceivedAt).toLocaleString()}`
                : t.automation.neverReceived}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={enable.isPending} onClick={() => enable.mutate()}>
            {status.enabled ? t.automation.newToken : t.automation.turnOn}
          </Button>
          {status.enabled && (
            <Button variant="outline" disabled={disable.isPending} onClick={() => disable.mutate()}>
              {t.automation.turnOff}
            </Button>
          )}
        </div>
        {status.enabled && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={status.autoMatchByPhone}
              onChange={(e) => autoMatch.mutate(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t.automation.autoMatchLabel}</span>
              <span className="block text-xs text-slate-500">{t.automation.autoMatchHint}</span>
            </span>
          </label>
        )}
      </Card>
      {token && (
        <Card className="space-y-2 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium">{t.automation.tokenOnce}</p>
          <p className="text-xs text-slate-600">{t.automation.urlLabel}</p>
          <code className="block break-all rounded bg-surface p-2 text-xs">{url}</code>
          <p className="text-xs text-slate-600">{t.automation.tokenLabel}</p>
          <code className="block break-all rounded bg-surface p-2 text-xs">{token}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(url)}>
              {t.automation.copyUrl}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(token)}>
              {t.automation.copyToken}
            </Button>
          </div>
        </Card>
      )}
      <Card className="space-y-2">
        <h2 className="font-medium">{t.automation.howTitle}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>{t.automation.how1}</li>
          <li>{t.automation.how2}</li>
          <li>{t.automation.how3}</li>
          <li>{t.automation.how4}</li>
        </ol>
        <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs">
          {`POST ${url}\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{"message": "<SMS text>"}`}
        </pre>
      </Card>
    </div>
  );
}
