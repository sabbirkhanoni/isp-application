import type { CustomerImportResultDto } from '@isp/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { customersKey, importCustomers } from './customers-api';

/** Byte-order mark so Excel opens the template as UTF-8 (Bangla names stay readable). */
const BOM = String.fromCharCode(0xfeff);
const TEMPLATE = [
  'customer_id,name,phone,address,area,package,connection_type,pppoe_username,router,status',
  'ISP-1001,Karim Mia,01711223344,House 5 Road 2,Mirpur,Home 10,PPPOE,karim01,Core-1,ACTIVE',
  'ISP-1002,Salma Begum,01911223366,Flat 3,Uttara,Home 10,PPPOE,salma02,,SUSPENDED',
].join('\r\n');

const fill = (text: string, count: number) => text.replace('{count}', String(count));

export function CustomerImportPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [result, setResult] = useState<CustomerImportResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (target: { name: string; csv: string }, commit: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await importCustomers(target.csv, commit, target.name);
      setResult(res);
      if (res.committed) await queryClient.invalidateQueries({ queryKey: customersKey });
    } catch (e) {
      setResult(null);
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (selected: File | undefined) => {
    if (!selected) return;
    const next = { name: selected.name, csv: await selected.text() };
    setFile(next);
    setResult(null);
    await run(next, false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(BOM + TEMPLATE)}`;
  const clean = result && !result.committed && result.errorCount === 0 && result.validRows > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.customers.import.title}</h1>
        <Link to="/customers" className="text-sm text-brand hover:underline">
          {t.customers.title}
        </Link>
      </div>

      <Card className="space-y-3">
        <p className="text-slate-600">{t.customers.import.intro}</p>
        <ul className="space-y-1 text-sm text-slate-600">
          <li>{t.customers.import.step1}</li>
          <li>{t.customers.import.step2}</li>
          <li>{t.customers.import.step3}</li>
        </ul>
        <p className="text-xs text-slate-500">{t.customers.import.noRouters}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={templateUrl}
            download="customers-template.csv"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t.customers.import.template}
          </a>
          <input
            ref={fileInput}
            id="customer-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button asChild variant="outline" className="cursor-pointer">
            <label htmlFor="customer-file">
              {busy ? t.customers.import.checking : t.customers.import.choose}
            </label>
          </Button>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {result?.committed && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {fill(t.customers.import.done, result.created)}
        </p>
      )}

      {result && !result.committed && (
        <Card className="space-y-3">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li>
              {t.customers.import.rows}: {result.totalRows}
            </li>
            <li>
              {t.customers.import.valid}: {result.validRows}
            </li>
            <li>
              {t.customers.import.problems}: {result.errorCount}
            </li>
          </ul>
          {clean && file && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-800">{t.customers.import.checkedOk}</p>
              <Button disabled={busy} onClick={() => void run(file, true)}>
                {fill(t.customers.import.importNow, result.validRows)}
              </Button>
            </div>
          )}
          {result.errorCount > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-red-700">{t.customers.import.problemsHint}</p>
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t.customers.import.line}</th>
                      <th className="px-3 py-2">{t.customers.import.field}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr
                        key={`${e.row}-${e.field}-${e.message}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-3 py-1.5">{e.row}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{e.field}</td>
                        <td className="px-3 py-1.5">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.errorCount > result.errors.length && (
                <p className="text-xs text-slate-500">{t.customers.import.more}</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
