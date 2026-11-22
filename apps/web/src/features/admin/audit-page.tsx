import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime } from '@/lib/format';
import { auditKey, fetchAudit, type AuditFilters } from './admin-api';

/** "CUSTOMER_UPDATED" -> "Customer updated": readable enough without a translation per action. */
const humanAction = (action: string) => {
  const words = action
    .replace(/^AUTH_/, '')
    .toLowerCase()
    .replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function AuditPage() {
  const { t, language } = useI18n();
  const [filters, setFilters] = useState<AuditFilters>({
    group: 'all',
    from: '',
    to: '',
    page: 1,
  });
  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const query = useQuery({ queryKey: [...auditKey, filters], queryFn: () => fetchAudit(filters) });
  const outcomeText = { SUCCESS: t.admin.ok, FAILURE: t.admin.failed, DENIED: t.admin.denied };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.admin.auditTitle}</h1>
        <p className="text-sm text-slate-600">{t.admin.auditIntro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          aria-label={t.admin.what}
          value={filters.group}
          onChange={(e) => set({ group: e.target.value as AuditFilters['group'] })}
        >
          <option value="all">{t.admin.groupAll}</option>
          <option value="logins">{t.admin.groupLogins}</option>
          <option value="denied">{t.admin.groupDenied}</option>
        </Select>
        <Input
          type="date"
          aria-label={t.admin.from}
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <Input
          type="date"
          aria-label={t.admin.to}
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      <Card className="overflow-x-auto p-0">
        {query.isPending && <Loading />}
        {query.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {query.data && query.data.items.length === 0 && (
          <p className="p-5 text-slate-500">{t.admin.empty}</p>
        )}
        {query.data && query.data.items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.admin.when}</th>
                <th className="px-4 py-2">{t.admin.who}</th>
                <th className="px-4 py-2">{t.admin.what}</th>
                <th className="px-4 py-2">{t.admin.result}</th>
                <th className="px-4 py-2">{t.admin.ip}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDateTime(row.createdAt, language)}
                  </td>
                  <td className="px-4 py-2">{row.actorUsername ?? t.admin.nobody}</td>
                  <td className="px-4 py-2">{humanAction(row.action)}</td>
                  <td
                    className={
                      row.outcome === 'SUCCESS' ? 'px-4 py-2' : 'px-4 py-2 font-medium text-red-700'
                    }
                  >
                    {outcomeText[row.outcome]}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pager
        pagination={query.data?.pagination}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </div>
  );
}
