import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { customersKey } from '@/features/customers/customers-api';
import { useI18n } from '@/i18n/i18n-context';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  customerBillingKey,
  fetchCustomerBilling,
  recordPayment,
  reversePayment,
  movePayment,
  billingKey,
} from './billing-api';
import { AdjustPanel } from './adjust-panel';
import { MovePayment } from './move-payment';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { PaymentForm } from './payment-form';
import { Loading } from '@/components/ui/page';

/** Dues, invoices and payments of one customer, plus "receive payment" (field staff use this daily). */
export function CustomerBillingSection({ customerId }: { customerId: string }) {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const billing = useQuery({
    queryKey: customerBillingKey(customerId),
    queryFn: () => fetchCustomerBilling(customerId),
  });
  // A payment can activate the customer, so the customer record must refresh too.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKey }),
      queryClient.invalidateQueries({ queryKey: customersKey }),
    ]);
  const record = useMutation({ mutationFn: recordPayment, onSuccess: refresh });
  const reverse = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => reversePayment(id, why),
    onSuccess: refresh,
  });

  if (billing.isPending) return <Loading />;
  if (billing.isError) return <p className="text-red-700">{t.common.genericError}</p>;
  const data = billing.data;
  const money = (poisha: number) => formatMoney(poisha, language);

  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-slate-500">{t.billing.outstanding}</div>
            <div className="text-2xl font-semibold">{money(data.outstandingPoisha)}</div>
          </div>
          {data.creditPoisha > 0 && (
            <div>
              <div className="text-xs text-slate-500">{t.billing.credit}</div>
              <div className="text-2xl font-semibold text-emerald-700">
                {money(data.creditPoisha)}
              </div>
            </div>
          )}
        </div>
        {can('CASH_COLLECTION_CREATE') && !showForm && (
          <Button onClick={() => setShowForm(true)}>{t.billing.recordPayment}</Button>
        )}
      </Card>

      {showForm && (
        <PaymentForm
          customerId={customerId}
          suggestedPoisha={data.outstandingPoisha}
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            await record.mutateAsync(input);
            setShowForm(false);
            setNotice(t.billing.recorded);
          }}
        />
      )}

      {can('BILLING_ADJUST') && (
        <AdjustPanel key={data.monthlyDiscountPoisha} customerId={customerId} data={data} />
      )}

      <Card className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-medium">{t.billing.invoices}</h2>
        {data.invoices.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t.billing.noInvoices}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.billing.month}</th>
                <th className="px-4 py-2">{t.billing.amount}</th>
                <th className="px-4 py-2">{t.billing.paid}</th>
                <th className="px-4 py-2">{t.billing.due}</th>
                <th className="px-4 py-2" />
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{inv.period}</td>
                  <td className="px-4 py-2">{money(inv.amountPoisha)}</td>
                  <td className="px-4 py-2">{money(inv.paidPoisha)}</td>
                  <td className="px-4 py-2">{inv.dueDate}</td>
                  <td className="px-4 py-2">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2">
                    <Link className="text-brand hover:underline" to={`/print/invoice/${inv.id}`}>
                      {t.extras.print}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">{t.billing.payments}</h2>
        {data.payments.length === 0 && (
          <p className="text-sm text-slate-500">{t.billing.noPayments}</p>
        )}
        {data.payments.map((p) => (
          <div
            key={p.id}
            className="space-y-1 border-t border-slate-100 pt-3 text-sm first:border-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">
                {money(p.amountPoisha)} · {p.method === 'CASH' ? t.billing.cash : t.billing.bkash}
                {p.status === 'REVERSED' && (
                  <Badge tone="bad" className="ml-2">
                    {t.billing.reversedLabel}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
                {p.receiptNumber}
                <Link className="text-brand hover:underline" to={`/print/receipt/${p.id}`}>
                  {t.extras.print}
                </Link>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {formatDateTime(p.receivedAt, language)} · {t.billing.receivedBy}: {p.receivedByName}
              {p.bkashTrxId ? ` · ${p.bkashTrxId}` : ''}
            </div>
            {p.movedAt && <div className="text-xs text-amber-700">{t.extras.movedFrom}</div>}
            {p.creditPoisha > 0 && (
              <div className="text-xs text-emerald-700">
                {t.billing.surplus}: {money(p.creditPoisha)}
              </div>
            )}
            {can('PAYMENT_REVERSE') &&
              p.status === 'POSTED' &&
              moving !== p.id &&
              reversing !== p.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mr-2"
                  onClick={() => setMoving(p.id)}
                >
                  {t.extras.move}
                </Button>
              )}
            {moving === p.id && (
              <MovePayment
                customerId={customerId}
                onCancel={() => setMoving(null)}
                onMove={async (toId, why) => {
                  await movePayment(p.id, { toCustomerId: toId, reason: why });
                  await refresh();
                  setMoving(null);
                  setNotice(t.extras.moved);
                }}
              />
            )}
            {can('PAYMENT_REVERSE') &&
              p.status === 'POSTED' &&
              reversing !== p.id &&
              moving !== p.id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReversing(p.id);
                    setReason('');
                  }}
                >
                  {t.billing.reverse}
                </Button>
              )}
            {reversing === p.id && (
              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  aria-label={t.billing.reverseReason}
                  placeholder={t.billing.reverseReason}
                  className="h-8 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reason.trim().length < 3}
                  onClick={async () => {
                    await reverse.mutateAsync({ id: p.id, why: reason.trim() });
                    setReversing(null);
                    setNotice(t.billing.reversed);
                  }}
                >
                  {t.billing.reverse}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReversing(null)}>
                  {t.common.cancel}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
