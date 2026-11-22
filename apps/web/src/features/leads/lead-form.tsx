import { zodResolver } from '@hookform/resolvers/zod';
import { CONNECTION_TYPES, createLeadSchema, type CreateLeadInput } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, UserPlus } from 'lucide-react';
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
  onCancel?: () => void;
}

/** Always-open, professional form to quickly register a new connection request. */
export function LeadForm({ onSubmit, onCancel }: LeadFormProps) {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const packages = useQuery({ queryKey: packagesKey, queryFn: fetchPackages });
  const {
    register,
    handleSubmit,
    reset,
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
      reset({ connectionType: 'PPPOE', fullName: '', phone: '', area: '', address: '', note: '', requestedPackageId: '' });
    } catch (e) {
      setMessage(toMessage(e));
    }
  });

  const handleReset = () => {
    reset({ connectionType: 'PPPOE', fullName: '', phone: '', area: '', address: '', note: '', requestedPackageId: '' });
    setMessage(null);
    if (onCancel) onCancel();
  };

  return (
    <Card className="space-y-4 border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <UserPlus className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.leads.formTitle}</h2>
            <p className="text-xs text-slate-500">{t.leads.formDesc}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="text-xs"
        >
          <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
          {t.leads.reset}
        </Button>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t.leads.fullName} htmlFor="l-name" error={errors.fullName && invalid}>
            <Input id="l-name" placeholder={language === 'bn' ? 'উদা: আরিফুল ইসলাম' : 'e.g. John Doe'} {...register('fullName')} />
          </Field>

          <Field label={t.leads.phone} htmlFor="l-phone" error={errors.phone && invalid}>
            <Input id="l-phone" inputMode="tel" placeholder="01XXXXXXXXX" {...register('phone')} />
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

          <Field label={t.leads.area} htmlFor="l-area">
            <Input id="l-area" placeholder={language === 'bn' ? 'উদা: উত্তরা সেক্টর ৪' : 'e.g. Sector 4'} {...register('area')} />
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
            <Input id="l-note" placeholder={language === 'bn' ? 'অতিরিক্ত চাহিদা বা মন্তব্য' : 'Extra notes'} {...register('note')} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <div className="sm:col-span-2">
            <Field label={t.leads.address} htmlFor="l-address" error={errors.address && invalid}>
              <Input
                id="l-address"
                placeholder={language === 'bn' ? 'বাসা/হোল্ডিং, রোড, ফ্ল্যাট নম্বর বা ল্যান্ডমার্ক' : 'House, Road, Flat no.'}
                {...register('address')}
              />
            </Field>
          </div>
          <div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              <Plus className="size-4 mr-1" aria-hidden="true" />
              {isSubmitting ? t.common.loading : t.leads.submit}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
