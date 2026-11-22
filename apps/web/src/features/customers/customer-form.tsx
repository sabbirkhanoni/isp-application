import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema, type CreateCustomerInput } from '@isp/contracts';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { User, Wifi, Radio, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/cn';
import { ActivationFields } from './activation-fields';

interface CustomerFormProps {
  onSubmit(input: CreateCustomerInput): Promise<void>;
  onCancel(): void;
  className?: string;
}

/** Admin creates a customer directly: contact details + connection/package + optical fiber device. */
export function CustomerForm({ onSubmit, onCancel, className }: CustomerFormProps) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      connectionType: 'PPPOE' as const,
      activationPolicy: 'AFTER_FIRST_PAYMENT' as const,
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
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
    <div className={cn('w-full', className)}>
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="space-y-4">
          {message && (
            <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {message}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Section 1: গ্রাহকের তথ্য (Personal Information) */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
                  <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700">
                    <User className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      {t.customers.infoSection}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t.customers.infoSectionSubtitle}</p>
                  </div>
                </div>

                <Field label={t.leads.fullName} htmlFor="c-name" error={errors.fullName && invalid}>
                  <Input id="c-name" placeholder={t.customers.namePlaceholder} {...register('fullName')} />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label={t.leads.phone} htmlFor="c-phone" error={errors.phone && invalid}>
                    <Input id="c-phone" inputMode="tel" placeholder={t.customers.phonePlaceholder} {...register('phone')} />
                  </Field>
                  <Field label={t.customers.altPhone} htmlFor="c-alt" error={errors.altPhone && invalid}>
                    <Input id="c-alt" inputMode="tel" placeholder={t.customers.altPhonePlaceholder} {...register('altPhone')} />
                  </Field>
                </div>

                <Field label={t.leads.area} htmlFor="c-area">
                  <Input id="c-area" placeholder={t.customers.areaPlaceholder} {...register('area')} />
                </Field>

                <Field label={t.leads.address} htmlFor="c-address" error={errors.address && invalid}>
                  <Input id="c-address" placeholder={t.customers.addressPlaceholder} {...register('address')} />
                </Field>
              </div>
            </div>

            {/* Section 2: প্যাকেজ ও সংযোগ (Package & Connection) */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
                  <div className="rounded-lg bg-sky-100 p-1.5 text-sky-700">
                    <Wifi className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      {t.customers.connectionSection}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t.customers.connectionSectionSubtitle}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <ActivationFields compactHints={true} />
                </div>
              </div>
            </div>

            {/* Section 3: ফাইবার ও ডিভাইস (Fiber & Device) */}
            <div className="lg:col-span-3 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
                  <div className="rounded-lg bg-violet-100 p-1.5 text-violet-700">
                    <Radio className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      {t.fiber.title}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t.customers.fiberSectionSubtitle}</p>
                  </div>
                </div>

                <Field label={t.fiber.oltName} htmlFor="c-olt">
                  <Input id="c-olt" placeholder={t.customers.oltPlaceholder} {...register('oltName')} />
                </Field>

                <Field label={t.fiber.ponPort} htmlFor="c-pon">
                  <Input id="c-pon" placeholder={t.customers.ponPlaceholder} {...register('ponPort')} />
                </Field>

                <Field label={t.fiber.onuSerial} htmlFor="c-onu">
                  <Input id="c-onu" autoCapitalize="characters" placeholder={t.customers.onuPlaceholder} {...register('onuSerial')} />
                </Field>

                <div className="rounded-lg bg-amber-50/80 border border-amber-200/80 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                  💡 {t.fiber.hint}
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onCancel} className="px-5">
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 shadow-sm gap-1.5"
            >
              <Check className="size-4" />
              {isSubmitting ? t.common.loading : t.customers.saveCustomer}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
