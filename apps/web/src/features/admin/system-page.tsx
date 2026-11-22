import { useQuery } from '@tanstack/react-query';
import type { SystemCheckItem } from '@isp/contracts';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import {
  dataQualityKey,
  exportUrl,
  fetchDataQuality,
  fetchSystemCheck,
  systemCheckKey,
} from './system-api';
import { Loading } from '@/components/ui/page';

const BADGE: Record<SystemCheckItem['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  info: 'bg-slate-100 text-slate-700',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-800',
};

function Readiness() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: systemCheckKey, queryFn: fetchSystemCheck });
  return (
    <Card className="space-y-3">
      <h2 className="font-medium">{t.system.checks}</h2>
      {query.isPending && <Loading />}
      {query.isError && <p className="text-red-700">{t.common.genericError}</p>}
      <ul className="divide-y divide-slate-100">
        {query.data?.map((item) => {
          const [label, hint] = t.system.items[item.key];
          return (
            <li key={item.key} className="flex items-start gap-3 py-2">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[item.status]}`}
              >
                {t.system[item.status]}
              </span>
              <div className="text-sm">
                <p className="font-medium">
                  {label}
                  {item.detail && (
                    <span className="ml-2 font-normal text-slate-500">{item.detail}</span>
                  )}
                </p>
                {item.status !== 'ok' && hint && <p className="text-slate-600">{hint}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Quality() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: dataQualityKey, queryFn: fetchDataQuality });
  const problems = query.data?.filter((g) => g.count > 0) ?? [];
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-medium">{t.system.quality}</h2>
        <p className="text-sm text-slate-600">{t.system.qualityIntro}</p>
      </div>
      {query.isPending && <Loading />}
      {query.data && problems.length === 0 && (
        <p className="text-sm text-emerald-700">{t.system.qualityClean}</p>
      )}
      {problems.map((group) => (
        <div key={group.key} className="space-y-1">
          <p className="text-sm font-medium">
            {t.system.groups[group.key]} <span className="text-red-700">({group.count})</span>
          </p>
          {group.count > group.samples.length && (
            <p className="text-xs text-slate-500">
              {t.system.qualityShown} {group.samples.length}
            </p>
          )}
          <ul className="text-sm">
            {group.samples.map((s) => (
              <li key={s.customerId}>
                <Link to={`/customers/${s.customerId}`} className="text-brand hover:underline">
                  {s.customerCode} · {s.fullName}
                </Link>
                {s.detail && (
                  <span className="ml-2 font-mono text-xs text-slate-500">{s.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

export function SystemPage() {
  const { t } = useI18n();
  const links = [
    ['customers', t.system.exportCustomers],
    ['invoices', t.system.exportInvoices],
    ['payments', t.system.exportPayments],
  ] as const;
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.system.title}</h1>
        <p className="text-sm text-slate-600">{t.system.intro}</p>
      </div>
      <Readiness />
      <Quality />
      <Card className="space-y-3">
        <div>
          <h2 className="font-medium">{t.system.export}</h2>
          <p className="text-sm text-slate-600">{t.system.exportIntro}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {links.map(([name, label]) => (
            <a
              key={name}
              href={exportUrl(name)}
              download
              className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
        </div>
      </Card>
      <Card className="space-y-1">
        <h2 className="font-medium">{t.system.restoreTitle}</h2>
        <p className="text-sm text-slate-600">{t.system.restoreText}</p>
      </Card>
    </div>
  );
}
