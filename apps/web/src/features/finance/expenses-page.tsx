import { EXPENSE_CATEGORIES, type ExpenseDto } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatDate, formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  createExpense,
  deleteExpense,
  expensesCsvUrl,
  expensesKey,
  fetchExpenses,
  financeKey,
  updateExpense,
} from './finance-api';

/** Dhaka's current month as YYYY-MM (for the month picker's default). */
export const thisMonth = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

interface FormState {
  spentOn: string;
  category: string;
  taka: string;
  payee: string;
  note: string;
}
const emptyForm = (): FormState => ({
  spentOn: today(),
  category: 'BANDWIDTH',
  taka: '',
  payee: '',
  note: '',
});

export function ExpensesPage() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(thisMonth());
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ExpenseDto | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...expensesKey, { period, category, page }],
    queryFn: () => fetchExpenses({ period, category, page }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: expensesKey });
    void queryClient.invalidateQueries({ queryKey: financeKey });
  };
  const save = useMutation({
    mutationFn: () => {
      const amountPoisha = Math.round(Number(form.taka) * 100);
      const body = {
        spentOn: form.spentOn,
        category: form.category as (typeof EXPENSE_CATEGORIES)[number],
        amountPoisha,
        payee: form.payee.trim(),
        note: form.note.trim(),
      };
      return editing && editing !== 'new'
        ? updateExpense(editing.id, {
            ...body,
            payee: body.payee || null,
            note: body.note || null,
          })
        : createExpense(body);
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  const open = (expense: ExpenseDto | 'new') => {
    setError(null);
    setEditing(expense);
    setForm(
      expense === 'new'
        ? emptyForm()
        : {
            spentOn: expense.spentOn,
            category: expense.category,
            taka: String(expense.amountPoisha / 100),
            payee: expense.payee ?? '',
            note: expense.note ?? '',
          },
    );
  };
  const submit = async () => {
    setError(null);
    if (!(Number(form.taka) >= 1)) {
      setError(t.errors.validation);
      return;
    }
    try {
      await save.mutateAsync();
    } catch (e) {
      setError(toMessage(e));
    }
  };
  const remove = async (expense: ExpenseDto) => {
    if (!window.confirm(t.finance.confirmDelete)) return;
    await deleteExpense(expense.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.finance.expensesTitle}</h1>
        <div className="flex gap-2">
          <a
            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            href={expensesCsvUrl(period)}
            download
          >
            {t.finance.download}
          </a>
          <Button size="sm" onClick={() => open('new')}>
            {t.finance.addExpense}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="month"
          aria-label={t.finance.month}
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label={t.finance.category}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.finance.allCategories}</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t.finance.categories[c]}
            </option>
          ))}
        </Select>
      </div>

      {editing && (
        <Card className="grid gap-3 sm:grid-cols-2">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          <Field label={t.finance.date} htmlFor="x-date">
            <Input
              id="x-date"
              type="date"
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
            />
          </Field>
          <Field label={t.finance.category} htmlFor="x-cat">
            <Select
              id="x-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.finance.categories[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.finance.amount} htmlFor="x-amount">
            <Input
              id="x-amount"
              inputMode="decimal"
              value={form.taka}
              onChange={(e) => setForm({ ...form, taka: e.target.value })}
            />
          </Field>
          <Field label={t.finance.payee} htmlFor="x-payee">
            <Input
              id="x-payee"
              value={form.payee}
              onChange={(e) => setForm({ ...form, payee: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t.finance.note} htmlFor="x-note">
              <Input
                id="x-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={save.isPending} onClick={() => void submit()}>
              {t.common.save}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {list.data?.items.length === 0 && (
          <p className="p-5 text-slate-500">{t.finance.noExpenses}</p>
        )}
        {list.data && list.data.items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.finance.date}</th>
                <th className="px-4 py-2">{t.finance.category}</th>
                <th className="px-4 py-2 text-right">{t.finance.amount}</th>
                <th className="hidden px-4 py-2 md:table-cell">{t.finance.payee}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">{formatDate(e.spentOn, language)}</td>
                  <td className="px-4 py-2">
                    {t.finance.categories[e.category]}
                    {e.note && <div className="text-xs text-slate-500">{e.note}</div>}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatMoney(e.amountPoisha, language)}
                  </td>
                  <td className="hidden px-4 py-2 text-slate-600 md:table-cell">
                    {e.payee ?? '—'}
                  </td>
                  <td className="space-x-2 px-4 py-2 text-right">
                    <button className="text-brand hover:underline" onClick={() => open(e)}>
                      {t.customers.edit}
                    </button>
                    <button className="text-red-700 hover:underline" onClick={() => void remove(e)}>
                      {t.finance.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {list.data && (
        <p className="text-sm text-slate-600">
          {t.finance.total}: <b>{formatMoney(list.data.totalPoisha, language)}</b>
        </p>
      )}
      <Pager pagination={list.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
