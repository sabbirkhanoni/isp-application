import type { TrendMonthDto } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { fetchTrend, reportsKey } from './reports-api';

/** Billed vs collected per month, with the unpaid part marked. Plain CSS bars, no chart library. */
export function TrendChart() {
  const { t, language } = useI18n();
  const query = useQuery({ queryKey: [...reportsKey, 'trend'], queryFn: () => fetchTrend(12) });
  const months: TrendMonthDto[] = query.data ?? [];
  const max = Math.max(1, ...months.map((m) => Math.max(m.billedPoisha, m.collectedPoisha)));
  if (months.every((m) => m.billedPoisha === 0 && m.collectedPoisha === 0)) return null;
  return (
    <Card className="space-y-3">
      <h2 className="font-medium">{t.insights.trendTitle}</h2>
      <div
        className="flex h-44 items-end gap-2 overflow-x-auto"
        role="img"
        aria-label={t.insights.trendTitle}
      >
        {months.map((m) => (
          <div
            key={m.period}
            className="flex h-full min-w-[34px] flex-1 flex-col justify-end"
            title={`${m.period}\n${t.insights.billed}: ${formatMoney(m.billedPoisha, language)}\n${t.insights.collected}: ${formatMoney(m.collectedPoisha, language)}\n${t.insights.unpaid}: ${formatMoney(m.unpaidPoisha, language)}`}
          >
            <div className="flex flex-1 items-end gap-0.5">
              <div
                className="flex flex-1 flex-col justify-end"
                style={{ height: `${(m.billedPoisha / max) * 100}%` }}
              >
                <div className="bg-amber-400" style={{ flexGrow: m.unpaidPoisha }} />
                <div
                  className="bg-slate-300"
                  style={{ flexGrow: Math.max(0, m.billedPoisha - m.unpaidPoisha) }}
                />
              </div>
              <div
                className="flex-1 bg-emerald-600"
                style={{ height: `${(m.collectedPoisha / max) * 100}%` }}
              />
            </div>
            <div className="mt-1 text-center text-[10px] text-slate-500">{m.period.slice(5)}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 bg-slate-300" /> {t.insights.billed}
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 bg-amber-400" /> {t.insights.unpaid}
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 bg-emerald-600" /> {t.insights.collected}
        </span>
      </div>
    </Card>
  );
}
