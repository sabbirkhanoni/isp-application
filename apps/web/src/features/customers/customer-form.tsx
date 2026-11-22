import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema, type CreateCustomerInput } from '@isp/contracts';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { ActivationFields } from './activation-fields';

interface CustomerFormProps {
  onSubmit(input: CreateCustomerInput): Promise<void>;
  onCancel(): void;
}

/** Admin creates a customer directly: contact details + the same activation section as lead approval. */
export function CustomerForm({ onSubmit, onCancel }: CustomerFormProps) {
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
    <Card>
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
          {message && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
              {message}
            </p>
          )}
          <Field label={t.leads.fullName} htmlFor="c-name" error={errors.fullName && invalid}>
            <Input id="c-name" {...register('fullName')} />
          </Field>
          <Field label={t.leads.phone} htmlFor="c-phone" error={errors.phone && invalid}>
            <Input id="c-phone" inputMode="tel" {...register('phone')} />
          </Field>
          <Field label={t.customers.altPhone} htmlFor="c-alt" error={errors.altPhone && invalid}>
            <Input id="c-alt" inputMode="tel" {...register('altPhone')} />
          </Field>
          <Field label={t.leads.area} htmlFor="c-area">
            <Input id="c-area" {...register('area')} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t.leads.address} htmlFor="c-address" error={errors.address && invalid}>
              <Input id="c-address" {...register('address')} />
            </Field>
          </div>
          <ActivationFields />
          <Field label={t.fiber.oltName} htmlFor="c-olt" hint={t.fiber.hint}>
            <Input id="c-olt" {...register('oltName')} />
          </Field>
          <Field label={t.fiber.ponPort} htmlFor="c-pon">
            <Input id="c-pon" {...register('ponPort')} />
          </Field>
          <Field label={t.fiber.onuSerial} htmlFor="c-onu">
            <Input id="c-onu" autoCapitalize="characters" {...register('onuSerial')} />
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
      </FormProvider>
    </Card>
  );
}
