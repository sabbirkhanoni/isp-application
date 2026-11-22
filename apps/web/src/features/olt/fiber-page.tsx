import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { EmptyState, Loading } from '@/components/ui/page';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime } from '@/lib/format';
import { FiberBadge } from './fiber-badge';
import { fetchFiber, fiberKey } from './olt-api';
import { Cable } from 'lucide-react';

type Filter = 'ALL' | 'CRITICAL' | 'WEAK' | 'GOOD' | 'UNMATCHED';

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function FiberPage() {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState<Filter>('CRITICAL');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(text.trim());
  const query = useQuery({
    queryKey: [...fiberKey, { filter, search, page }],
    queryFn: () => fetchFiber({ filter, search, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const summary = query.data?.summary;
  const tiles: Array<[string, number | undefined, Filter, string]> = [
    [t.fiberSignal.critical, summary?.critical, 'CRITICAL', 'text-red-600'],
    [t.fiberSignal.weak, summary?.weak, 'WEAK', 'text-amber-600'],
    [t.fiberSignal.good, summary?.good, 'GOOD', 'text-emerald-600'],
    [t.fiberSignal.all, summary?.total, 'ALL', ''],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.fiberSignal.title}</h1>
      <p className="text-sm text-slate-600">{t.fiberSignal.intro}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, target, tone]) => (
          <button
            key={target}
            type="button"
            className="text-left"
            onClick={() => {
              setFilter(target);
              setPage(1);
            }}
          >
            <Card className={`space-y-1 ${filter === target ? 'ring-2 ring-brand' : ''}`}>
              <div className="text-sm text-slate-500">{label}</div>
              <div className={`text-2xl font-semibold ${tone}`}>{value ?? '–'}</div>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          value={text}
          placeholder={t.fiberSignal.search}
          aria-label={t.fiberSignal.search}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
        />
        {filter === 'UNMATCHED' && (
          <button type="button" className="text-sm text-brand" onClick={() => setFilter('ALL')}>
            {t.fiberSignal.showAll}
          </button>
        )}
      </div>

      {query.isLoading ? (
        <Loading />
      ) : query.data && query.data.rows.length === 0 ? (
        <EmptyState
          icon={Cable}
          title={filter === 'CRITICAL' ? t.fiberSignal.noneCritical : t.fiberSignal.empty}
          hint={filter === 'CRITICAL' ? undefined : t.fiberSignal.emptyHint}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-3">{t.fiberSignal.customer}</th>
                <th className="p-3">{t.fiberSignal.signal}</th>
                <th className="hidden p-3 sm:table-cell">{t.fiberSignal.onu}</th>
                <th className="hidden p-3 md:table-cell">{t.fiberSignal.olt}</th>
                <th className="hidden p-3 lg:table-cell">{t.fiberSignal.updated}</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.rows.map((r) => (
                <tr key={`${r.oltName}-${r.onuIndex}`} className="border-t border-line">
                  <td className="p-3">
                    {r.customerId ? (
                      <Link to={`/customers/${r.customerId}`} className="font-medium text-brand">
                        {r.customerName}
                        <span className="ml-1 font-normal text-slate-500">{r.customerCode}</span>
                      </Link>
                    ) : (
                      <span className="text-slate-500">{t.fiberSignal.unknownOnu}</span>
                    )}
                    {r.phone && <div className="text-xs text-slate-500">{r.phone}</div>}
                  </td>
                  <td className="p-3">
                    <FiberBadge rxDbm={r.rxDbm} level={r.level} />
                  </td>
                  <td className="hidden p-3 font-mono text-xs sm:table-cell">{r.onuKey}</td>
                  <td className="hidden p-3 md:table-cell">{r.oltName}</td>
                  <td className="hidden p-3 text-slate-500 lg:table-cell">
                    {formatDateTime(r.updatedAt, language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager pagination={query.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
