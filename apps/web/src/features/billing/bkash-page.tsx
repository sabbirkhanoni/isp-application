import type { BkashImportResultDto, BkashTransactionDto } from '@isp/contracts';
import { BKASH_TX_STATUSES } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { customersKey, fetchCustomers } from '@/features/customers/customers-api';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  assignBkashTransaction,
  bkashKey,
  fetchBkashTransactions,
  ignoreBkashTransaction,
  importBkashStatement,
} from './bkash-api';

const TONES = {
  POSTED: 'good',
  VERIFIED: 'good',
  NEEDS_REVIEW: 'warn',
  ASSIGNED: 'good',
  IGNORED: 'neutral',
} as const;
type Action = { kind: 'assign' | 'ignore'; id: string } | null;

function AssignPanel({
  tx,
  onPick,
}: {
  tx: BkashTransactionDto;
  onPick(customerId: string): void;
}) {
  const { t, language } = useI18n();
  const [search, setSearch] = useState('');
  const results = useQuery({
    queryKey: [...customersKey, 'picker', search],
    queryFn: () => fetchCustomers({ page: 1, search: search.trim(), status: '' }),
    enabled: search.trim().length >= 2,
  });
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      {tx.suggestedCustomer && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">{t.bkash.suggested}:</span>
          <Button size="sm" onClick={() => onPick(tx.suggestedCustomer!.id)}>
            {tx.suggestedCustomer.fullName} ({tx.suggestedCustomer.customerCode})
          </Button>
        </div>
      )}
      <Input
        aria-label={t.bkash.searchCustomer}
        placeholder={t.bkash.searchCustomer}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {results.data?.customers.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className="block w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-left text-sm hover:border-brand"
        >
          <span className="font-medium">{c.fullName}</span> ·{' '}
          <span className="font-mono text-xs">{c.customerCode}</span> · {c.phone}
          <span className="ml-2 text-xs text-slate-500">
            {formatMoney(c.subscription?.monthlyPricePoisha ?? 0, language)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function BkashPage() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('NEEDS_REVIEW');
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<BkashImportResultDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...bkashKey, { page, status }],
    queryFn: () => fetchBkashTransactions(page, status),
    placeholderData: keepPreviousData,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: bkashKey }),
      queryClient.invalidateQueries({ queryKey: ['billing'] }),
      queryClient.invalidateQueries({ queryKey: customersKey }),
    ]);

  const upload = useMutation({
    mutationFn: ({ name, csv }: { name: string; csv: string }) => importBkashStatement(name, csv),
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: ({ id, customerId }: { id: string; customerId: string }) =>
      assignBkashTransaction(id, customerId),
    onSuccess: refresh,
  });
  const ignore = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => ignoreBkashTransaction(id, why),
    onSuccess: refresh,
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setNotice(null);
    try {
      const res = await upload.mutateAsync({ name: file.name, csv: await file.text() });
      setResult(res.data);
      setStatus('NEEDS_REVIEW');
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? t.bkash.badFile : toMessage(e));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await fn();
      setAction(null);
      setReason('');
      setNotice(done);
    } catch (e) {
      setError(toMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.bkash.title}</h1>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card className="space-y-3">
        <h2 className="font-medium">{t.bkash.upload}</h2>
        <p className="text-sm text-slate-600">{t.bkash.uploadHint}</p>
        <input
          ref={fileInput}
          id="bkash-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button asChild variant="outline" className="cursor-pointer">
          <label htmlFor="bkash-file">
            {upload.isPending ? t.bkash.uploading : t.bkash.chooseFile}
          </label>
        </Button>
        {result && (
          <div role="status" className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-medium">{t.bkash.result}</div>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li>
                {t.bkash.rows}: {result.totalRows}
              </li>
              <li>
                {t.bkash.posted}: {result.posted}
              </li>
              <li>
                {t.bkash.verified}: {result.verified}
              </li>
              <li>
                {t.bkash.needsReview}: {result.needsReview}
              </li>
              <li>
                {t.bkash.duplicates}: {result.duplicates}
              </li>
              <li>
                {t.bkash.invalid}: {result.invalid}
              </li>
            </ul>
            {result.problems.length > 0 && (
              <details>
                <summary className="cursor-pointer text-slate-600">{t.bkash.problems}</summary>
                <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                  {result.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <h2 className="font-medium">{t.bkash.queue}</h2>
        <Select
          className="w-48"
          aria-label={t.customers.status}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.leads.all}</option>
          {BKASH_TX_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.bkash.status[s]}
            </option>
          ))}
        </Select>
        {list.data && list.data.needsReview > 0 && (
          <Badge tone="warn">
            {t.bkash.needsReview}: {list.data.needsReview}
          </Badge>
        )}
      </div>

      {list.isPending && <Loading />}
      {list.isError && <p className="text-red-700">{t.common.genericError}</p>}
      {list.data?.transactions.length === 0 && (
        <p className="text-slate-500">{t.bkash.nothingToReview}</p>
      )}
      <div className="space-y-3">
        {list.data?.transactions.map((tx) => (
          <Card key={tx.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{formatMoney(tx.amountPoisha, language)}</div>
              <Badge tone={TONES[tx.status]}>{t.bkash.status[tx.status]}</Badge>
            </div>
            <div className="text-sm text-slate-600">
              <span className="font-mono text-xs">{tx.trxId}</span> ·{' '}
              {formatDateTime(tx.occurredAt, language)}
            </div>
            <div className="text-xs text-slate-500">
              {t.bkash.sender}: {tx.senderPhone ?? '—'} · {t.bkash.reference}: {tx.reference ?? '—'}
            </div>
            {tx.reviewReason && tx.status === 'NEEDS_REVIEW' && (
              <div className="text-sm text-amber-800">{t.bkash.reason[tx.reviewReason]}</div>
            )}
            {tx.customer && (
              <div className="text-sm">
                {tx.customer.fullName} ·{' '}
                <span className="font-mono text-xs">{tx.customer.customerCode}</span>
                {tx.receiptNumber ? ` · ${tx.receiptNumber}` : ''}
              </div>
            )}
            {tx.ignoreReason && <div className="text-sm text-slate-600">{tx.ignoreReason}</div>}

            {tx.status === 'NEEDS_REVIEW' && action?.id !== tx.id && (
              <div className="flex gap-2 pt-1">
                {tx.reviewReason !== 'AMOUNT_MISMATCH' && (
                  <Button size="sm" onClick={() => setAction({ kind: 'assign', id: tx.id })}>
                    {t.bkash.assign}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAction({ kind: 'ignore', id: tx.id })}
                >
                  {t.bkash.ignore}
                </Button>
              </div>
            )}
            {action?.id === tx.id && action.kind === 'assign' && (
              <div className="space-y-2">
                <AssignPanel
                  tx={tx}
                  onPick={(customerId) =>
                    void run(() => assign.mutateAsync({ id: tx.id, customerId }), t.bkash.assigned)
                  }
                />
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>
                  {t.common.cancel}
                </Button>
              </div>
            )}
            {action?.id === tx.id && action.kind === 'ignore' && (
              <div className="flex flex-wrap gap-2">
                <Input
                  className="flex-1"
                  aria-label={t.bkash.ignoreReason}
                  placeholder={t.bkash.ignoreReason}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reason.trim().length < 3}
                  onClick={() =>
                    void run(
                      () => ignore.mutateAsync({ id: tx.id, why: reason.trim() }),
                      t.bkash.ignored,
                    )
                  }
                >
                  {t.bkash.ignore}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAction(null)}>
                  {t.common.cancel}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Pager pagination={list.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
