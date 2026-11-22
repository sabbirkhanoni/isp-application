import { LINE_FILTERS } from '@isp/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime } from '@/lib/format';
import { formatSince, isStale, LineBadge } from './line-badge';
import { fetchLines, linesKey } from './network-api';

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function LinesPage() {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState<string>('OFFLINE');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(text.trim());
  const lines = useQuery({
    queryKey: [...linesKey, { filter, search, page }],
    queryFn: () => fetchLines({ filter, search, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const summary = lines.data?.summary;

  const tiles: Array<[string, number | undefined, string]> = [
    [t.lines.online, summary?.online, 'ONLINE'],
    [t.lines.offline, summary?.offline, 'OFFLINE'],
    [t.lines.neverSeen, summary?.neverSeen, 'NEVER_SEEN'],
    [t.lines.managed, summary?.managed, 'ALL'],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.lines.title}</h1>
      <p className="text-sm text-slate-600">{t.lines.intro}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, target]) => (
          <button
            key={target}
            type="button"
            onClick={() => {
              setFilter(target);
              setPage(1);
            }}
            className="text-left"
          >
            <Card className={`space-y-1 ${filter === target ? 'ring-2 ring-brand' : ''}`}>
              <div className="text-sm text-slate-500">{label}</div>
              <div className="text-2xl font-semibold">{value ?? '–'}</div>
            </Card>
          </button>
        ))}
      </div>
      {summary && summary.activeButOffline > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {t.lines.activeButOffline}: {summary.activeButOffline}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          value={text}
          placeholder={t.lines.search}
          aria-label={t.lines.search}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="sm:w-56"
          aria-label={t.lines.filter}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          {LINE_FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === 'ALL' ? t.leads.all : t.lines.state[f]}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-x-auto p-0">
        {lines.isPending && <Loading />}
        {lines.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {lines.data?.lines.length === 0 && <p className="p-5 text-slate-500">{t.lines.empty}</p>}
        {lines.data && lines.data.lines.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.customers.code}</th>
                <th className="px-4 py-2">{t.leads.fullName}</th>
                <th className="px-4 py-2">{t.lines.line}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.lines.details}</th>
              </tr>
            </thead>
            <tbody>
              {lines.data.lines.map((l) => (
                <tr key={l.customerId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link className="text-brand hover:underline" to={`/customers/${l.customerId}`}>
                      {l.customerCode}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{l.customerName}</div>
                    <div className="text-xs text-slate-500">{l.phone}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <LineBadge state={l.state} />
                      {l.customerStatus === 'SUSPENDED' && (
                        <Badge tone="bad">{t.enums.customerStatus.SUSPENDED}</Badge>
                      )}
                      {isStale(l) && <Badge tone="warn">{t.lines.stale}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {l.routerName} · {l.pppoeUsername}
                    </div>
                  </td>
                  <td className="hidden px-4 py-2 text-xs text-slate-600 md:table-cell">
                    {l.state === 'ONLINE' && (
                      <>
                        <div>
                          {l.address} {l.callerId && `· ${l.callerId}`}
                        </div>
                        {l.onlineSince && (
                          <div>
                            {t.lines.onlineFor}: {formatSince(l.onlineSince, language)}
                          </div>
                        )}
                      </>
                    )}
                    {l.state !== 'ONLINE' && (
                      <div>
                        {t.lines.lastOnline}:{' '}
                        {l.lastOnlineAt
                          ? formatDateTime(l.lastOnlineAt, language)
                          : t.routers.never}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pager pagination={lines.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
