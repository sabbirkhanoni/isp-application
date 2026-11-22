import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime, formatMoney } from '@/lib/format';
import { billingKey, fetchPayments } from './billing-api';

/** Read-only ledger of all payments. Reversals are done on the customer page, next to the context. */
export function PaymentsPage() {
  const { t, language } = useI18n();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...billingKey, 'payments', page],
    queryFn: () => fetchPayments(page),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.billing.paymentsTitle}</h1>
      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {list.data?.payments.length === 0 && (
          <p className="p-5 text-slate-500">{t.billing.noPayments}</p>
        )}
        {list.data && list.data.payments.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.billing.receipt}</th>
                <th className="px-4 py-2">{t.leads.fullName}</th>
                <th className="px-4 py-2">{t.billing.amount}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.billing.method}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.billing.receivedBy}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    {p.receiptNumber}
                    <div className="text-slate-400">{formatDateTime(p.receivedAt, language)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Link className="text-brand hover:underline" to={`/customers/${p.customerId}`}>
                      {p.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatMoney(p.amountPoisha, language)}</td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    {p.method === 'CASH'
                      ? t.billing.cash
                      : `${t.billing.bkash} ${p.bkashTrxId ?? ''}`}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{p.receivedByName}</td>
                  <td className="px-4 py-2">
                    {p.status === 'REVERSED' && <Badge tone="bad">{t.billing.reversedLabel}</Badge>}
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
