import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { thisMonth } from './expenses-page';
import {
  fetchAreas,
  fetchChurn,
  fetchCollectors,
  fetchProfit,
  financeKey,
  reportCsvUrl,
} from './finance-api';
import { Loading } from '@/components/ui/page';

const csvLink = 'text-sm text-brand hover:underline';

export function FinancePage() {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState(thisMonth());
  const profit = useQuery({
    queryKey: [...financeKey, 'profit', period],
    queryFn: () => fetchProfit(period),
  });
  const collectors = useQuery({
    queryKey: [...financeKey, 'collectors', period],
    queryFn: () => fetchCollectors(period),
  });
  const areas = useQuery({
    queryKey: [...financeKey, 'areas', period],
    queryFn: () => fetchAreas(period),
  });
  const churn = useQuery({ queryKey: [...financeKey, 'churn'], queryFn: fetchChurn });
  const money = (p: number) => formatMoney(p, language);

  const months = profit.data?.months ?? [];
  const peak = Math.max(1, ...months.flatMap((m) => [m.collectedPoisha, m.expensesPoisha]));
  const current = months.find((m) => m.period === period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.finance.title}</h1>
        <Input
          type="month"
          className="w-auto"
          aria-label={t.finance.month}
          value={period}
          onChange={(e) => e.target.value && setPeriod(e.target.value)}
        />
      </div>

      {current && (
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              [t.finance.billed, current.invoicedPoisha],
              [t.finance.collected, current.collectedPoisha],
              [t.finance.expenses, current.expensesPoisha],
              [t.finance.profit, current.profitPoisha],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="space-y-1">
              <div className="text-sm text-slate-500">{label}</div>
              <div
                className={`text-xl font-semibold ${label === t.finance.profit && value < 0 ? 'text-red-700' : ''}`}
              >
                {money(value)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t.finance.byMonth}</h2>
          <a className={csvLink} href={reportCsvUrl('profit', period)} download>
            {t.finance.download}
          </a>
        </div>
        <p className="text-xs text-slate-500">{t.finance.cashBasis}</p>
        {profit.isPending && <Loading />}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-1 pr-3">{t.finance.month}</th>
                <th className="py-1 pr-3 text-right">{t.finance.collected}</th>
                <th className="py-1 pr-3 text-right">{t.finance.expenses}</th>
                <th className="py-1 text-right">{t.finance.profit}</th>
                <th className="hidden w-40 py-1 pl-4 md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.period} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3">{m.period}</td>
                  <td className="py-1.5 pr-3 text-right">{money(m.collectedPoisha)}</td>
                  <td className="py-1.5 pr-3 text-right">{money(m.expensesPoisha)}</td>
                  <td
                    className={`py-1.5 text-right font-medium ${m.profitPoisha < 0 ? 'text-red-700' : ''}`}
                  >
                    {money(m.profitPoisha)}
                  </td>
                  <td className="hidden py-1.5 pl-4 md:table-cell" aria-hidden="true">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{ width: `${(m.collectedPoisha / peak) * 100}%` }}
                    />
                    <div
                      className="mt-0.5 h-2 rounded bg-amber-500"
                      style={{ width: `${(m.expensesPoisha / peak) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {profit.data && profit.data.categories.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-medium">
            {t.finance.byCategory} ({period})
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {profit.data.categories.map((c) => (
              <li key={c.category} className="flex justify-between py-1.5">
                <span>
                  {t.finance.categories[c.category as keyof typeof t.finance.categories] ??
                    c.category}
                </span>
                <span className="font-medium">{money(c.totalPoisha)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            {t.finance.byStaff} ({period})
          </h2>
          <a className={csvLink} href={reportCsvUrl('collectors', period)} download>
            {t.finance.download}
          </a>
        </div>
        {collectors.data?.length === 0 && (
          <p className="text-sm text-slate-500">{t.finance.nothing}</p>
        )}
        {collectors.data && collectors.data.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-1">{t.finance.staff}</th>
                <th className="py-1 text-right">{t.finance.paymentCount}</th>
                <th className="py-1 text-right">{t.finance.cash}</th>
                <th className="py-1 text-right">bKash</th>
                <th className="py-1 text-right">{t.finance.total}</th>
              </tr>
            </thead>
            <tbody>
              {collectors.data.map((c) => (
                <tr key={c.userId} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 text-right">{c.payments}</td>
                  <td className="py-1.5 text-right">{money(c.cashPoisha)}</td>
                  <td className="py-1.5 text-right">{money(c.bkashPoisha)}</td>
                  <td className="py-1.5 text-right font-medium">{money(c.totalPoisha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-2 overflow-x-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t.finance.byArea}</h2>
          <a className={csvLink} href={reportCsvUrl('areas', period)} download>
            {t.finance.download}
          </a>
        </div>
        {areas.data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-1">{t.finance.area}</th>
                <th className="py-1 text-right">{t.finance.customers}</th>
                <th className="py-1 text-right">{t.finance.activeCustomers}</th>
                <th className="py-1 text-right">{t.finance.due}</th>
                <th className="py-1 text-right">{t.finance.collected}</th>
              </tr>
            </thead>
            <tbody>
              {areas.data.map((a) => (
                <tr key={a.area ?? '—'} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{a.area ?? t.finance.noArea}</td>
                  <td className="py-1.5 text-right">{a.customers}</td>
                  <td className="py-1.5 text-right">{a.activeCustomers}</td>
                  <td className="py-1.5 text-right">{money(a.outstandingPoisha)}</td>
                  <td className="py-1.5 text-right">{money(a.collectedPoisha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">{t.finance.churnTitle}</h2>
        {churn.data && (
          <>
            <p className="text-sm text-slate-600">
              {t.finance.nowActive}: <b>{churn.data.now.active}</b> · {t.finance.nowSuspended}:{' '}
              <b>{churn.data.now.suspended}</b> ({t.finance.nonPayment}:{' '}
              <b>{churn.data.now.suspendedNonPayment}</b>) · {t.finance.nowLeft}:{' '}
              <b>{churn.data.now.terminated}</b>
            </p>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-1">{t.finance.month}</th>
                  <th className="py-1 text-right">{t.finance.newCustomers}</th>
                  <th className="py-1 text-right">{t.finance.lostCustomers}</th>
                </tr>
              </thead>
              <tbody>
                {[...churn.data.months].reverse().map((m) => (
                  <tr key={m.period} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5">{m.period}</td>
                    <td className="py-1.5 text-right">{m.newCustomers}</td>
                    <td className="py-1.5 text-right">{m.lostCustomers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
