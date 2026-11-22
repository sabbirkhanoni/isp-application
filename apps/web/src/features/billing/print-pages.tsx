import { useQuery } from '@tanstack/react-query';
import type { BillingSettings, InvoiceLineDto } from '@isp/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/i18n-context';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import {
  billingSettingsKey,
  fetchBillingSettings,
  fetchInvoiceDetail,
  fetchReceipt,
} from './billing-api';
import { Loading } from '@/components/ui/page';

type Format = 'A4' | 'SMALL';

function usePrintFormat(): [Format, (f: Format) => void] {
  const [format, setFormat] = useState<Format>(() => {
    try {
      return localStorage.getItem('printFormat') === 'SMALL' ? 'SMALL' : 'A4';
    } catch {
      return 'A4';
    }
  });
  const change = (next: Format) => {
    setFormat(next);
    try {
      localStorage.setItem('printFormat', next);
    } catch {
      /* the choice just is not remembered */
    }
  };
  return [format, change];
}

/** Toolbar (hidden on paper) + a sheet sized for A4 or an 80 mm thermal roll. */
function PrintFrame({
  back,
  children,
}: {
  back: string;
  children(settings: BillingSettings, format: Format): ReactNode;
}) {
  const { t } = useI18n();
  const [format, setFormat] = usePrintFormat();
  const settings = useQuery({ queryKey: billingSettingsKey, queryFn: fetchBillingSettings });
  return (
    <div className="min-h-screen bg-slate-100 print:bg-surface">
      <style>{`@page { size: ${format === 'A4' ? 'A4' : '80mm auto'}; margin: ${format === 'A4' ? '14mm' : '3mm'}; }`}</style>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 p-4 print:hidden">
        <Link to={back} className="text-sm text-brand hover:underline">
          {t.extras.back}
        </Link>
        <select
          aria-label={t.extras.print}
          className="h-9 rounded-lg border border-slate-300 bg-surface px-2 text-sm"
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
        >
          <option value="A4">{t.extras.formatA4}</option>
          <option value="SMALL">{t.extras.formatSmall}</option>
        </select>
        <Button onClick={() => window.print()}>{t.extras.print}</Button>
      </div>
      <div
        className={
          format === 'A4'
            ? 'mx-auto max-w-3xl bg-surface p-8 text-sm shadow print:max-w-none print:p-0 print:shadow-none'
            : 'mx-auto w-[80mm] bg-surface p-3 text-xs shadow print:w-full print:p-0 print:shadow-none'
        }
      >
        {settings.data && children(settings.data, format)}
      </div>
    </div>
  );
}

function Header({ settings, title }: { settings: BillingSettings; title: string }) {
  return (
    <header className="mb-4 border-b border-slate-300 pb-3 text-center">
      <div className="text-lg font-bold">{settings.business.name}</div>
      {settings.business.address && <div>{settings.business.address}</div>}
      {settings.business.phone && <div>{settings.business.phone}</div>}
      <div className="mt-2 font-semibold uppercase tracking-wide">{title}</div>
    </header>
  );
}

function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-0.5 ${bold ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function PrintReceiptPage() {
  const { id = '' } = useParams();
  const { t, language } = useI18n();
  const receipt = useQuery({ queryKey: ['print', 'receipt', id], queryFn: () => fetchReceipt(id) });
  const money = (p: number) => formatMoney(p, language);
  if (receipt.isPending) return <Loading />;
  if (receipt.isError) return <p className="p-6 text-red-700">{t.common.genericError}</p>;
  const r = receipt.data;
  return (
    <PrintFrame back={`/customers/${r.customerId}`}>
      {(settings) => (
        <>
          <Header settings={settings} title={t.extras.receiptTitle} />
          <Row
            label={t.billing.receipt}
            value={<span className="font-mono">{r.receiptNumber}</span>}
          />
          <Row label={t.extras.date} value={formatDateTime(r.receivedAt, language)} />
          <Row label={t.extras.customer} value={`${r.customerName} (${r.customerCode})`} />
          <Row label={t.extras.phone} value={r.customerPhone} />
          <Row label={t.extras.address} value={r.customerAddress} />
          <hr className="my-3 border-slate-300" />
          <Row
            label={t.extras.method}
            value={
              r.method === 'CASH' ? t.billing.cash : `${t.billing.bkash} ${r.bkashTrxId ?? ''}`
            }
          />
          {r.allocations.length > 0 && (
            <div className="py-1">
              <div className="text-slate-600">{t.extras.appliedTo}</div>
              {r.allocations.map((a) => (
                <Row key={a.invoiceNumber} label={a.invoiceNumber} value={money(a.amountPoisha)} />
              ))}
            </div>
          )}
          {r.creditPoisha > 0 && (
            <Row label={t.extras.surplusToCredit} value={money(r.creditPoisha)} />
          )}
          <hr className="my-3 border-slate-300" />
          <Row
            label={t.billing.amount}
            value={<span className="text-base">{money(r.amountPoisha)}</span>}
            bold
          />
          <Row label={t.extras.stillDue} value={money(r.outstandingPoisha)} />
          <Row label={t.billing.receivedBy} value={r.receivedByName} />
          {r.status === 'REVERSED' && (
            <p className="mt-2 text-center font-bold text-red-700">{t.billing.reversedLabel}</p>
          )}
          <p className="mt-4 text-center">{settings.business.footer || t.extras.thanks}</p>
        </>
      )}
    </PrintFrame>
  );
}

function lineLabel(line: InvoiceLineDto, t: ReturnType<typeof useI18n>['t']): string {
  switch (line.kind) {
    case 'PACKAGE':
      return `${t.extras.lineInternet} ${line.description}`.trim();
    case 'PRORATION':
      return line.amountPoisha < 0
        ? `${t.extras.lineUnused} (${line.description})`
        : `${t.extras.linePart} ${line.description}`.trim();
    case 'DISCOUNT':
      return `${t.extras.lineDiscount} ${line.description}`.trim();
    default:
      return line.description;
  }
}

export function PrintInvoicePage() {
  const { id = '' } = useParams();
  const { t, language } = useI18n();
  const invoice = useQuery({
    queryKey: ['print', 'invoice', id],
    queryFn: () => fetchInvoiceDetail(id),
  });
  const money = (p: number) => formatMoney(p, language);
  if (invoice.isPending) return <Loading />;
  if (invoice.isError) return <p className="p-6 text-red-700">{t.common.genericError}</p>;
  const inv = invoice.data;
  const balance = inv.amountPoisha - inv.paidPoisha;
  return (
    <PrintFrame back={`/customers/${inv.customerId}`}>
      {(settings) => (
        <>
          <Header settings={settings} title={t.extras.invoiceTitle} />
          <Row
            label={t.billing.invoiceNo}
            value={<span className="font-mono">{inv.invoiceNumber}</span>}
          />
          <Row label={t.billing.month} value={inv.period} />
          <Row label={t.billing.due} value={formatDate(inv.dueDate, language)} />
          <Row label={t.extras.customer} value={`${inv.customerName} (${inv.customerCode})`} />
          <Row label={t.extras.phone} value={inv.customerPhone} />
          <Row label={t.extras.address} value={inv.customerAddress} />
          <hr className="my-3 border-slate-300" />
          <div className="text-slate-600">{t.extras.item}</div>
          {inv.lines.map((line, i) => (
            <Row key={i} label={lineLabel(line, t)} value={money(line.amountPoisha)} />
          ))}
          <hr className="my-3 border-slate-300" />
          <Row label={t.extras.total} value={money(inv.amountPoisha)} bold />
          {inv.creditAppliedPoisha > 0 && (
            <Row label={t.extras.credit} value={money(inv.creditAppliedPoisha)} />
          )}
          {inv.payments.map((p) => (
            <Row
              key={p.receiptNumber}
              label={`${t.extras.paid} ${p.receiptNumber}`}
              value={money(p.amountPoisha)}
            />
          ))}
          <Row label={t.extras.balance} value={money(balance)} bold />
          <p className="mt-4 text-center">{settings.business.footer || t.extras.thanks}</p>
        </>
      )}
    </PrintFrame>
  );
}
