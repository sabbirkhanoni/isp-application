import { CUSTOMER_STATUSES } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { EmptyState, Loading } from '@/components/ui/page';
import { Users } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { CustomerForm } from './customer-form';
import { CustomerStatusBadge } from './customer-status-badge';
import { createCustomer, customersKey, fetchCustomers } from './customers-api';

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CustomersPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(false);
  const search = useDebounced(searchText.trim());

  const list = useQuery({
    queryKey: [...customersKey, { page, search, status }],
    queryFn: () => fetchCustomers({ page, search, status }),
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.customers.title}</h1>
        <div className="flex gap-2">
          {can('CUSTOMER_IMPORT') && (
            <Link
              to="/customers/import"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              {t.customers.import.button}
            </Link>
          )}
          {can('CUSTOMER_CREATE_ACTIVE') && !showForm && (
            <Button onClick={() => setShowForm(true)}>{t.customers.add}</Button>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {t.customers.created}
        </p>
      )}

      {showForm && (
        <CustomerForm
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setShowForm(false);
            setNotice(true);
          }}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          value={searchText}
          placeholder={t.customers.search}
          aria-label={t.customers.search}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="sm:w-56"
          aria-label={t.customers.status}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.leads.all}</option>
          {CUSTOMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.enums.customerStatus[s]}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {list.data?.customers.length === 0 && <EmptyState icon={Users} title={t.customers.empty} />}
        {list.data && list.data.customers.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.customers.code}</th>
                <th className="px-4 py-2">{t.leads.fullName}</th>
                <th className="px-4 py-2">{t.leads.phone}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.customers.package}</th>
                <th className="px-4 py-2">{t.customers.status}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link className="text-brand hover:underline" to={`/customers/${c.id}`}>
                      {c.customerCode}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {c.fullName}
                    {c.isFree && (
                      <Badge tone="good" className="ml-2">
                        {t.free.badge}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    {c.subscription?.packageName ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <CustomerStatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pager pagination={list.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
