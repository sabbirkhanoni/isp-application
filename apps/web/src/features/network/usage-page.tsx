import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { formatBytes } from '@/lib/format';
import { fetchTopUsage, usageKey } from './usage-api';
import { Loading } from '@/components/ui/page';

export function UsagePage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState('');
  const query = useQuery({
    queryKey: [...usageKey, 'top', period],
    queryFn: () => fetchTopUsage(period),
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.insights.topUsageTitle}</h1>
        <p className="text-sm text-slate-600">{t.insights.topUsageIntro}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        {t.dashboard.month}
        <Input
          type="month"
          className="w-44"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </label>
      {query.isPending && <Loading />}
      {query.data && query.data.length === 0 && (
        <p className="text-sm text-slate-500">{t.insights.noUsage}</p>
      )}
      {query.data && query.data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">{t.insights.customer}</th>
                <th className="p-3">{t.insights.download}</th>
                <th className="p-3">{t.insights.upload}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r, i) => (
                <tr key={r.customerId} className="border-t border-slate-100">
                  <td className="p-3 text-slate-400">{i + 1}</td>
                  <td className="p-3">
                    <Link className="text-brand hover:underline" to={`/customers/${r.customerId}`}>
                      {r.customerName}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {r.customerCode} · {r.pppoeUsername}
                    </span>
                  </td>
                  <td className="p-3">{formatBytes(r.downloadBytes)}</td>
                  <td className="p-3">{formatBytes(r.uploadBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
