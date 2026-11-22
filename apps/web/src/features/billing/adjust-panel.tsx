import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CustomerBillingDto } from '@isp/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { addCharge, billingKey, cancelCharge, setDiscount } from './billing-api';

const toPoisha = (taka: string) => Math.round(Number(taka) * 100);

/** Standing monthly discount and one-time charges/discounts (admin, or staff who were granted the right). */
export function AdjustPanel({
  customerId,
  data,
}: {
  customerId: string;
  data: CustomerBillingDto;
}) {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [discountTaka, setDiscountTaka] = useState(String(data.monthlyDiscountPoisha / 100));
  const [discountNote, setDiscountNote] = useState(data.discountNote ?? '');
  const [kind, setKind] = useState<'CHARGE' | 'DISCOUNT'>('CHARGE');
  const [description, setDescription] = useState('');
  const [amountTaka, setAmountTaka] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: billingKey });
  const money = (poisha: number) => formatMoney(poisha, language);
  const report = (ok: boolean, text: string) => setMessage({ ok, text });

  const saveDiscount = useMutation({
    mutationFn: () =>
      setDiscount(customerId, {
        monthlyDiscountPoisha: Math.max(0, toPoisha(discountTaka || '0')),
        ...(discountNote.trim() ? { note: discountNote.trim() } : {}),
      }),
    onSuccess: async () => {
      await refresh();
      report(true, t.extras.discountSaved);
    },
    onError: (e) => report(false, toMessage(e)),
  });
  const add = useMutation({
    mutationFn: () => {
      const poisha = toPoisha(amountTaka);
      return addCharge(customerId, {
        description: description.trim(),
        amountPoisha: kind === 'DISCOUNT' ? -poisha : poisha,
      });
    },
    onSuccess: async () => {
      await refresh();
      setDescription('');
      setAmountTaka('');
      report(true, t.extras.chargeAdded);
    },
    onError: (e) => report(false, toMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelCharge(id),
    onSuccess: async () => {
      await refresh();
      report(true, t.extras.chargeCancelled);
    },
    onError: (e) => report(false, toMessage(e)),
  });

  const advanceMonths =
    data.monthlyNetPoisha > 0 ? Math.floor(data.creditPoisha / data.monthlyNetPoisha) : 0;
  const canAdd = description.trim().length >= 2 && toPoisha(amountTaka) > 0;

  return (
    <Card className="space-y-5">
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}
        >
          {message.text}
        </p>
      )}
      {data.creditPoisha > 0 && advanceMonths > 0 && (
        <p className="text-sm text-emerald-700">
          {t.extras.advanceCovers} {advanceMonths} {t.extras.months}
        </p>
      )}

      <div className="space-y-2">
        <div>
          <h3 className="font-medium">{t.extras.discountTitle}</h3>
          <p className="text-xs text-slate-500">{t.extras.discountHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t.extras.discountAmount}
            placeholder={t.extras.discountAmount}
            inputMode="decimal"
            className="w-40"
            value={discountTaka}
            onChange={(e) => setDiscountTaka(e.target.value)}
          />
          <Input
            aria-label={t.extras.discountNote}
            placeholder={t.extras.discountNote}
            className="min-w-48 flex-1"
            maxLength={120}
            value={discountNote}
            onChange={(e) => setDiscountNote(e.target.value)}
          />
          <Button disabled={saveDiscount.isPending} onClick={() => saveDiscount.mutate()}>
            {t.common.save}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">{t.extras.chargeTitle}</h3>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label={t.extras.chargeTitle}
            className="w-44"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'CHARGE' | 'DISCOUNT')}
          >
            <option value="CHARGE">{t.extras.kindCharge}</option>
            <option value="DISCOUNT">{t.extras.kindDiscount}</option>
          </Select>
          <Input
            aria-label={t.extras.chargeDescription}
            placeholder={t.extras.chargeDescription}
            className="min-w-48 flex-1"
            maxLength={80}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            aria-label={t.extras.chargeAmount}
            placeholder={t.extras.chargeAmount}
            inputMode="decimal"
            className="w-32"
            value={amountTaka}
            onChange={(e) => setAmountTaka(e.target.value)}
          />
          <Button disabled={!canAdd || add.isPending} onClick={() => add.mutate()}>
            {t.extras.add}
          </Button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.charges.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {c.description}{' '}
                <span className={c.amountPoisha < 0 ? 'text-emerald-700' : ''}>
                  {money(c.amountPoisha)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={c.status === 'PENDING' ? 'warn' : 'neutral'}>
                  {c.status === 'PENDING'
                    ? t.extras.chargePending
                    : `${t.extras.chargeBilled} ${c.invoiceNumber ?? ''}`}
                </Badge>
                {c.status === 'PENDING' && (
                  <Button size="sm" variant="outline" onClick={() => cancel.mutate(c.id)}>
                    {t.common.cancel}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
