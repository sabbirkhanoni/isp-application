import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { billingKey, fetchInvoices, generateInvoices } from './billing-api';
import { InvoiceStatusBadge } from './invoice-status-badge';

export function InvoicesPage() {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const list = useQuery({
    queryKey: [...billingKey, 'invoices', { page, period, search, unpaidOnly }],
    queryFn: () => fetchInvoices({ page, period, search: search.trim(), unpaidOnly }),
    placeholderData: keepPreviousData,
  });
  const generate = useMutation({
    mutationFn: () => generateInvoices(period || undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKey }),
  });

  const runGenerate = async () => {
    setMessage(null);
    try {
      const res = await generate.mutateAsync();
      setMessage({ ok: true, text: `${t.billing.generated} ${res.data.created}` });
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.billing.invoicesTitle}</h1>
        {can('BILLING_RUN') && (
          <Button onClick={() => void runGenerate()} disabled={generate.isPending}>
            {t.billing.generate}
          </Button>
        )}
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={
            message.ok
              ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800'
              : 'rounded-lg bg-red-50 p-3 text-sm text-red-700'
          }
        >
          {message.text}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="month"
          aria-label={t.billing.month}
          className="sm:w-48"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="search"
          aria-label={t.customers.search}
          placeholder={t.customers.search}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={unpaidOnly}
            onChange={(e) => {
              setUnpaidOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t.billing.unpaidOnly}
        </label>
      </div>
      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {list.data?.invoices.length === 0 && (
          <p className="p-5 text-slate-500">{t.billing.noInvoices}</p>
        )}
        {list.data && list.data.invoices.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.billing.invoiceNo}</th>
                <th className="px-4 py-2">{t.leads.fullName}</th>
                <th className="px-4 py-2">{t.billing.amount}</th>
                <th className="px-4 py-2">{t.billing.paid}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.billing.due}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2">
                    <Link
                      className="text-brand hover:underline"
                      to={`/customers/${inv.customerId}`}
                    >
                      {inv.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatMoney(inv.amountPoisha, language)}</td>
                  <td className="px-4 py-2">{formatMoney(inv.paidPoisha, language)}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{inv.dueDate}</td>
                  <td className="px-4 py-2">
                    <InvoiceStatusBadge status={inv.status} />
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
