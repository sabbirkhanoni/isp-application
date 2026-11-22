import { zodResolver } from '@hookform/resolvers/zod';
import type { RecordPaymentInput } from '@isp/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';

const formSchema = z.object({
  amountTaka: z.coerce.number().min(1).max(10_000_000),
  method: z.enum(['CASH', 'BKASH']),
  bkashTrxId: z.string().trim().optional(),
  note: z.string().trim().max(500).optional(),
});

interface PaymentFormProps {
  customerId: string;
  suggestedPoisha: number;
  onSubmit(input: RecordPaymentInput): Promise<void>;
  onCancel(): void;
}

/** Cash for everyone; bKash (with transaction ID) only when the user may enter it. */
export function PaymentForm({ customerId, suggestedPoisha, onSubmit, onCancel }: PaymentFormProps) {
  const { t } = useI18n();
  const { can } = useAuth();
  const toMessage = useErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      method: 'CASH' as const,
      amountTaka: suggestedPoisha > 0 ? suggestedPoisha / 100 : undefined,
    },
  });
  const method = watch('method');
  const invalid = t.errors.validation;

  const submit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await onSubmit({
        customerId,
        amountPoisha: Math.round(values.amountTaka * 100),
        method: values.method,
        ...(values.method === 'BKASH' && values.bkashTrxId
          ? { bkashTrxId: values.bkashTrxId }
          : {}),
        ...(values.note ? { note: values.note } : {}),
      } as RecordPaymentInput);
    } catch (e) {
      setMessage(toMessage(e));
    }
  });

  return (
    <Card className="border-brand">
      <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
        <h3 className="font-medium md:col-span-2">{t.billing.recordPayment}</h3>
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
            {message}
          </p>
        )}
        <Field
          label={t.billing.amountTaka}
          htmlFor="pay-amount"
          error={errors.amountTaka && invalid}
        >
          <Input
            id="pay-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register('amountTaka')}
          />
        </Field>
        <Field label={t.billing.method} htmlFor="pay-method">
          <Select id="pay-method" {...register('method')}>
            <option value="CASH">{t.billing.cash}</option>
            {can('PAYMENT_RECORD_BKASH') && <option value="BKASH">{t.billing.bkash}</option>}
          </Select>
        </Field>
        {method === 'BKASH' && (
          <Field
            label={t.billing.bkashTrxId}
            htmlFor="pay-trx"
            error={errors.bkashTrxId && invalid}
          >
            <Input
              id="pay-trx"
              autoCapitalize="characters"
              autoComplete="off"
              {...register('bkashTrxId')}
            />
          </Field>
        )}
        <Field label={t.billing.note} htmlFor="pay-note">
          <Input id="pay-note" {...register('note')} />
        </Field>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {t.common.save}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
