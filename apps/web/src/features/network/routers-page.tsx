import type { RouterDto, RouterWithTokenDto } from '@isp/contracts';
import { NETWORK_JOB_STATUSES } from '@isp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  createRouter,
  fetchJobs,
  fetchRouters,
  jobsKey,
  retryJob,
  rotateRouterToken,
  routersKey,
  testRouter,
  updateRouter,
} from './network-api';
import { RouterForm } from './router-form';

const JOB_TONES = { PENDING: 'warn', RUNNING: 'warn', DONE: 'good', FAILED: 'bad' } as const;

function JobsPanel() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('FAILED');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const jobs = useQuery({
    queryKey: [...jobsKey, status],
    queryFn: () => fetchJobs(status),
    refetchInterval: 15_000,
  });
  const retry = useMutation({
    mutationFn: retryJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobsKey }),
  });

  const onRetry = async (id: string) => {
    try {
      await retry.mutateAsync(id);
      setNotice({ ok: true, text: t.routers.retried });
    } catch (e) {
      setNotice({ ok: false, text: toMessage(e) });
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">{t.routers.jobs}</h2>
        <Select
          className="w-44"
          aria-label={t.routers.jobs}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t.routers.allJobs}</option>
          {NETWORK_JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.routers.status[s]}
            </option>
          ))}
        </Select>
        {jobs.data && jobs.data.needsAttention > 0 && (
          <Badge tone="bad">
            {t.routers.jobsAttention}: {jobs.data.needsAttention}
          </Badge>
        )}
      </div>
      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`rounded-lg p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
        >
          {notice.text}
        </p>
      )}
      {jobs.data?.jobs.length === 0 && <p className="text-sm text-slate-500">{t.routers.noJobs}</p>}
      {jobs.data?.jobs.map((job) => (
        <Card key={job.id} className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={`/customers/${job.customerId}`}
              className="font-medium text-brand hover:underline"
            >
              {job.customerName} <span className="font-mono text-xs">{job.customerCode}</span>
            </Link>
            <Badge tone={JOB_TONES[job.status]}>{t.routers.status[job.status]}</Badge>
          </div>
          <div className="text-xs text-slate-500">
            {job.routerName} · {formatDateTime(job.createdAt, language)} · {t.routers.attempts}:{' '}
            {job.attempts}
            {job.appliedState &&
              ` · ${job.appliedState === 'ENABLED' ? t.routers.jobEnabled : t.routers.jobDisabled}`}
          </div>
          {job.lastError && <div className="text-sm text-red-700">{job.lastError}</div>}
          {job.status === 'FAILED' && (
            <Button size="sm" variant="outline" onClick={() => void onRetry(job.id)}>
              {t.routers.retry}
            </Button>
          )}
        </Card>
      ))}
    </section>
  );
}

export function RoutersPage() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<'new' | RouterDto | null>(null);
  const [token, setToken] = useState<RouterWithTokenDto | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const routers = useQuery({ queryKey: routersKey, queryFn: fetchRouters });
  const refresh = () => queryClient.invalidateQueries({ queryKey: routersKey });

  const say = (ok: boolean, text: string) => setNotice({ ok, text });

  const onTest = async (router: RouterDto) => {
    setTesting(router.id);
    try {
      const result = await testRouter(router.id);
      say(result.ok, `${router.name}: ${result.message}`);
      await refresh();
    } catch (e) {
      say(false, toMessage(e));
    } finally {
      setTesting(null);
    }
  };

  const onRotate = async (router: RouterDto) => {
    try {
      setToken(await rotateRouterToken(router.id));
    } catch (e) {
      say(false, toMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.routers.title}</h1>
        {!form && <Button onClick={() => setForm('new')}>{t.routers.add}</Button>}
      </div>

      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`rounded-lg p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
        >
          {notice.text}
        </p>
      )}

      {token?.agentToken && (
        <Card className="space-y-2 border-amber-300 bg-amber-50">
          <h2 className="font-medium">{t.routers.tokenTitle}</h2>
          <code
            data-testid="agent-token"
            className="block break-all rounded bg-surface p-2 font-mono text-xs"
          >
            {token.agentToken}
          </code>
          <p className="text-sm text-slate-600">{t.routers.tokenHint}</p>
          <Button size="sm" variant="outline" onClick={() => setToken(null)}>
            {t.common.close}
          </Button>
        </Card>
      )}

      {form && (
        <RouterForm
          {...(form !== 'new' ? { router: form } : {})}
          onCancel={() => setForm(null)}
          onSubmit={async (input) => {
            if (form === 'new') {
              const created = await createRouter(input);
              if (created.agentToken) setToken(created);
            } else {
              await updateRouter(form.id, {
                name: input.name,
                host: input.host ?? null,
                port: input.port,
                useTls: input.useTls,
                allowSelfSigned: input.allowSelfSigned,
                username: input.username ?? null,
                ...(input.password ? { password: input.password } : {}),
              });
            }
            setForm(null);
            say(true, t.routers.saved);
            await refresh();
          }}
        />
      )}

      {routers.data?.length === 0 && !form && <p className="text-slate-500">{t.routers.empty}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {routers.data?.map((router) => (
          <Card key={router.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{router.name}</h2>
              <Badge tone={router.isActive ? 'good' : 'neutral'}>
                {router.isActive ? t.routers.active : t.routers.inactive}
              </Badge>
            </div>
            <div className="text-sm text-slate-600">
              {t.routers[`driver${router.driver}`]}
              {router.host && ` · ${router.host}:${router.port}`}
            </div>
            <div className="text-xs text-slate-500">
              {t.routers.customers}: {router.customerCount} · {t.routers.online}:{' '}
              {router.onlineCount} · {t.routers.lastSeen}:{' '}
              {router.lastSeenAt ? formatDateTime(router.lastSeenAt, language) : t.routers.never}
            </div>
            {router.lastError && <div className="text-sm text-red-700">{router.lastError}</div>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setForm(router)}>
                {t.routers.edit}
              </Button>
              {router.driver === 'REST' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === router.id}
                  onClick={() => void onTest(router)}
                >
                  {testing === router.id ? t.routers.testing : t.routers.test}
                </Button>
              )}
              <Link
                to={`/admin/routers/${router.id}/compare`}
                className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {t.compare.open}
              </Link>
              {router.driver === 'AGENT' && (
                <Button size="sm" variant="outline" onClick={() => void onRotate(router)}>
                  {t.routers.rotate}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void updateRouter(router.id, { isActive: !router.isActive }).then(refresh)
                }
              >
                {router.isActive ? t.routers.deactivate : t.routers.reactivate}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <JobsPanel />
    </div>
  );
}
