import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { formatDate, formatMoney } from '@/lib/format';
import { duesCsvUrl, fetchDues, reportsKey } from './reports-api';

export function DuesPage() {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const query = useQuery({
    queryKey: [...reportsKey, 'dues', { page, search, overdueOnly }],
    queryFn: () => fetchDues(page, search.trim(), overdueOnly),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.dues.title}</h1>
        {can('FINANCE_REPORT_READ') && (
          <a
            href={duesCsvUrl(search.trim(), overdueOnly)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t.dashboard.exportDues}
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          aria-label={t.dues.search}
          placeholder={t.dues.search}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t.dues.overdueOnly}
        </label>
        {query.data && (
          <span className="text-sm text-slate-500">
            {query.data.pagination.total} {t.dues.summary}
          </span>
        )}
      </div>

      {query.isPending && <Loading />}
      {query.isError && <p className="text-red-700">{t.common.genericError}</p>}
      {query.data?.rows.length === 0 && <p className="text-slate-500">{t.dues.none}</p>}

      <div className="space-y-3">
        {query.data?.rows.map((row) => (
          <Card key={row.customerId} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/customers/${row.customerId}`}
                className="font-medium text-brand hover:underline"
              >
                {row.customerName} <span className="font-mono text-xs">{row.customerCode}</span>
              </Link>
              <span className="text-lg font-semibold">
                {formatMoney(row.outstandingPoisha, language)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <a href={`tel:${row.phone}`} className="hover:underline">
                {row.phone}
              </a>
              {row.area && (
                <span>
                  {t.dues.area}: {row.area}
                </span>
              )}
              <span>
                {t.dues.bills}: {row.openInvoices}
              </span>
              <span>
                {t.dues.oldest}: {formatDate(`${row.oldestDueDate}T00:00:00+06:00`, language)}
              </span>
              {row.daysOverdue > 0 && (
                <Badge tone="bad">
                  {t.dues.daysLate}: {row.daysOverdue}
                </Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Pager pagination={query.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
