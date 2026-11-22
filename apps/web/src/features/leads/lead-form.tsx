import { zodResolver } from '@hookform/resolvers/zod';
import { CONNECTION_TYPES, createLeadSchema, type CreateLeadInput } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fetchPackages, packagesKey } from '@/features/packages/packages-api';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

interface LeadFormProps {
  onSubmit(input: CreateLeadInput): Promise<void>;
  onCancel(): void;
}

/** Simple, mobile-friendly form for field staff to register a new connection request. */
export function LeadForm({ onSubmit, onCancel }: LeadFormProps) {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const packages = useQuery({ queryKey: packagesKey, queryFn: fetchPackages });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { connectionType: 'PPPOE' as const },
  });
  const invalid = t.errors.validation;

  const submit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setMessage(toMessage(e));
    }
  });

  return (
    <Card>
      <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
            {message}
          </p>
        )}
        <Field label={t.leads.fullName} htmlFor="l-name" error={errors.fullName && invalid}>
          <Input id="l-name" {...register('fullName')} />
        </Field>
        <Field label={t.leads.phone} htmlFor="l-phone" error={errors.phone && invalid}>
          <Input id="l-phone" inputMode="tel" {...register('phone')} />
        </Field>
        <Field label={t.leads.area} htmlFor="l-area">
          <Input id="l-area" {...register('area')} />
        </Field>
        <Field label={t.leads.requestedPackage} htmlFor="l-package">
          <Select id="l-package" {...register('requestedPackageId')}>
            <option value="">{t.leads.anyPackage}</option>
            {packages.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.monthlyPricePoisha, language)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.activation.connectionType} htmlFor="l-type">
          <Select id="l-type" {...register('connectionType')}>
            {CONNECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.connectionType[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.leads.note} htmlFor="l-note">
          <Input id="l-note" {...register('note')} />
        </Field>
        <div className="md:col-span-2">
          <Field label={t.leads.address} htmlFor="l-address" error={errors.address && invalid}>
            <Input id="l-address" {...register('address')} />
          </Field>
        </div>
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
