import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useErrorMessage } from '@/lib/use-error-message';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime } from '@/lib/format';
import {
  compareKey,
  fetchCompare,
  fixRouter,
  refreshRouterAccounts,
  routerOnlyCsvUrl,
} from './network-api';
import { Loading } from '@/components/ui/page';

export function ComparePage() {
  const { id = '' } = useParams();
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const report = useQuery({ queryKey: [...compareKey, id], queryFn: () => fetchCompare(id) });
  const reload = () => queryClient.invalidateQueries({ queryKey: [...compareKey, id] });

  const refresh = useMutation({
    mutationFn: () => refreshRouterAccounts(id),
    onSuccess: reload,
  });
  const fix = useMutation({ mutationFn: () => fixRouter(id), onSuccess: reload });

  const run = async (action: 'refresh' | 'fix') => {
    setMessage(null);
    try {
      if (action === 'refresh') await refresh.mutateAsync();
      else {
        const { queued } = await fix.mutateAsync();
        setMessage({ ok: true, text: t.compare.fixed.replace('{count}', String(queued)) });
      }
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };

  const data = report.data;
  const fixable = data
    ? data.mismatches.length + data.missingOnRouter.filter((c) => c.canCreate).length
    : 0;
  const onOff = (disabled: boolean) => (disabled ? t.compare.disabled : t.compare.enabled);

  return (
    <div className="space-y-4">
      <Link to="/admin/routers" className="text-sm text-brand hover:underline">
        ← {t.nav.routers}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">
        {t.compare.title}
        {data ? `: ${data.routerName}` : ''}
      </h1>
      <p className="text-sm text-slate-600">{t.compare.intro}</p>

      {report.isPending && <Loading />}
      {report.isError && <p className="text-red-700">{t.common.genericError}</p>}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={
            message.ok
              ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800'
              : 'rounded-lg bg-red-50 p-3 text-sm text-red-700'
          }
        >
          {message.text}
        </p>
      )}

      {data && (
        <>
          <Card className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">
              {data.checkedAt
                ? `${t.compare.checkedAt}: ${formatDateTime(data.checkedAt, language)} · ${t.compare.accountsOnRouter}: ${data.routerCount}`
                : t.compare.neverChecked}
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={refresh.isPending}
                onClick={() => void run('refresh')}
              >
                {t.compare.refresh}
              </Button>
              <Button
                size="sm"
                disabled={fix.isPending || fixable === 0}
                onClick={() => void run('fix')}
              >
                {t.compare.fix} ({fixable})
              </Button>
            </div>
          </Card>

          {data.checkedAt &&
            data.missingOnRouter.length === 0 &&
            data.mismatches.length === 0 &&
            data.routerOnly.length === 0 && (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                {t.compare.allGood}
              </p>
            )}

          {data.missingOnRouter.length > 0 && (
            <Card className="space-y-2">
              <h2 className="font-medium">
                {t.compare.missingTitle} ({data.missingOnRouter.length})
              </h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {data.missingOnRouter.map((c) => (
                  <li key={c.customerId} className="flex flex-wrap gap-x-3 py-1.5">
                    <Link className="text-brand hover:underline" to={`/customers/${c.customerId}`}>
                      {c.customerCode}
                    </Link>
                    <span>{c.customerName}</span>
                    <span className="font-mono text-slate-500">{c.pppoeUsername}</span>
                    {!c.canCreate && (
                      <span className="text-xs text-amber-700">{t.compare.cannotCreate}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.mismatches.length > 0 && (
            <Card className="space-y-2">
              <h2 className="font-medium">
                {t.compare.mismatchTitle} ({data.mismatches.length})
              </h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {data.mismatches.map((c) => (
                  <li key={c.customerId} className="py-1.5">
                    <div className="flex flex-wrap gap-x-3">
                      <Link
                        className="text-brand hover:underline"
                        to={`/customers/${c.customerId}`}
                      >
                        {c.customerCode}
                      </Link>
                      <span>{c.customerName}</span>
                      <span className="font-mono text-slate-500">{c.pppoeUsername}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {t.compare.wanted}: {c.wantedProfile ?? '—'} / {onOff(c.wantedDisabled)} ·{' '}
                      {t.compare.onRouter}: {c.routerProfile ?? '—'} / {onOff(c.routerDisabled)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.routerOnly.length > 0 && (
            <Card className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">
                  {t.compare.routerOnlyTitle} ({data.routerOnly.length})
                </h2>
                <a
                  className="text-sm text-brand hover:underline"
                  href={routerOnlyCsvUrl(id)}
                  download
                >
                  {t.compare.download}
                </a>
              </div>
              <p className="text-xs text-slate-500">{t.compare.routerOnlyHint}</p>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
                {data.routerOnly.map((r) => (
                  <li key={r.name} className="flex flex-wrap gap-x-3 py-1.5">
                    <span className="font-mono">{r.name}</span>
                    <span className="text-slate-500">{r.profile ?? '—'}</span>
                    <span className="text-slate-500">{onOff(r.disabled)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
