import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import { formatBytes } from '@/lib/format';
import { fetchCustomerUsage, usageKey } from './usage-api';

export function UsageCard({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: [...usageKey, customerId],
    queryFn: () => fetchCustomerUsage(customerId),
  });
  if (!query.data || query.data.noData) return null;
  const months = query.data.months;
  const max = Math.max(1, ...months.map((m) => m.downloadBytes + m.uploadBytes));
  return (
    <Card className="space-y-2">
      <h2 className="font-medium">{t.insights.usageTitle}</h2>
      <ul className="space-y-1.5 text-sm">
        {months.map((m) => {
          const total = m.downloadBytes + m.uploadBytes;
          return (
            <li key={m.period} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
              <span className="text-slate-500">{m.period}</span>
              <span className="h-2 rounded bg-slate-100">
                <span
                  className="block h-2 rounded bg-brand"
                  style={{ width: `${(total / max) * 100}%` }}
                />
              </span>
              <span className="text-xs text-slate-600">
                ↓ {formatBytes(m.downloadBytes)} · ↑ {formatBytes(m.uploadBytes)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">{t.insights.usageNote}</p>
    </Card>
  );
}
