import type { AssignedCollectorRowDto } from '@isp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  assignCollector,
  collectorsKey,
  fetchCollectorOverview,
  setCollectorTarget,
} from './collectors-api';
import { Loading } from '@/components/ui/page';

export function ProgressBar({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  return (
    <div className="h-2 w-full rounded bg-slate-100" role="progressbar" aria-valuenow={pct}>
      <div
        className={pct >= 100 ? 'h-2 rounded bg-emerald-600' : 'h-2 rounded bg-brand'}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TargetCell({ row, period }: { row: AssignedCollectorRowDto; period: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(row.targetPoisha ? String(row.targetPoisha / 100) : '');
  const save = useMutation({
    mutationFn: () =>
      setCollectorTarget({
        userId: row.userId as string,
        period,
        targetPoisha: Math.round((Number(value) || 0) * 100),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectorsKey }),
    onError: (e) => window.alert(toMessage(e)),
  });
  return (
    <div className="flex items-center gap-1">
      <Input
        inputMode="numeric"
        className="h-8 w-24"
        aria-label={t.insights.target}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
      />
      <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
        {t.common.save}
      </Button>
    </div>
  );
}

export function CollectorsPage() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState('');
  const query = useQuery({
    queryKey: [...collectorsKey, period],
    queryFn: () => fetchCollectorOverview(period),
  });
  const [collectorId, setCollectorId] = useState('');
  const [area, setArea] = useState('');
  const [codes, setCodes] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const assign = useMutation({
    mutationFn: () => {
      const list = codes.split(/[\s,;]+/).filter(Boolean);
      return assignCollector({
        collectorId: collectorId === 'none' ? null : collectorId,
        ...(area ? { area } : { customerCodes: list }),
      });
    },
    onSuccess: async ({ updated }) => {
      setNote({ ok: true, text: t.insights.assigned.replace('{n}', String(updated)) });
      await queryClient.invalidateQueries({ queryKey: collectorsKey });
    },
    onError: (e) => setNote({ ok: false, text: toMessage(e) }),
  });

  const data = query.data;
  const money = (v: number) => formatMoney(v, language);
  const users = data?.users ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.insights.collectorsTitle}</h1>
        <p className="text-sm text-slate-600">{t.insights.collectorsIntro}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        {t.dashboard.month}
        <Input
          type="month"
          className="w-44"
          value={period || data?.period || ''}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </label>
      {query.isPending && <Loading />}
      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">{t.insights.collector}</th>
                <th className="p-3">{t.insights.customers}</th>
                <th className="p-3">{t.insights.billed}</th>
                <th className="p-3">{t.insights.collected}</th>
                <th className="p-3">{t.insights.outstanding}</th>
                <th className="p-3">{t.insights.target}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId ?? 'none'} className="border-t border-slate-100 align-top">
                  <td className="p-3 font-medium">{r.userId ? r.name : t.insights.unassigned}</td>
                  <td className="p-3">{r.customers}</td>
                  <td className="p-3">{money(r.billedPoisha)}</td>
                  <td className="p-3">
                    {money(r.collectedPoisha)}
                    {r.targetPoisha ? (
                      <div className="mt-1 w-32 space-y-0.5">
                        <ProgressBar done={r.collectedPoisha} target={r.targetPoisha} />
                        <span className="text-xs text-slate-500">
                          {Math.round((r.collectedPoisha / r.targetPoisha) * 100)}%
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">{money(r.outstandingPoisha)}</td>
                  <td className="p-3">
                    {r.userId ? (
                      <TargetCell
                        key={`${r.userId}-${data.period}-${r.targetPoisha}`}
                        row={r}
                        period={data.period}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card className="space-y-3">
        <h2 className="font-medium">{t.insights.assignTitle}</h2>
        <p className="text-xs text-slate-500">{t.insights.assignHint}</p>
        <Select
          value={collectorId}
          onChange={(e) => setCollectorId(e.target.value)}
          aria-label={t.insights.collector}
        >
          <option value="">{t.insights.chooseCollector}</option>
          <option value="none">{t.insights.removeAssignment}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Input
          list="c-areas"
          placeholder={t.insights.areaPlaceholder}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <datalist id="c-areas">
          {data?.areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        {!area && (
          <textarea
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-surface p-3 text-sm"
            placeholder={t.insights.codesPlaceholder}
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
          />
        )}
        <Button
          disabled={!collectorId || (!area && !codes.trim()) || assign.isPending}
          onClick={() => assign.mutate()}
        >
          {t.insights.assignNow}
        </Button>
        {note && (
          <p
            role={note.ok ? 'status' : 'alert'}
            className={note.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}
          >
            {note.text}
          </p>
        )}
      </Card>
    </div>
  );
}
