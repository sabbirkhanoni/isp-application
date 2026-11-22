import { zodResolver } from '@hookform/resolvers/zod';
import { approveLeadSchema, type ApproveLeadInput, type LeadDto } from '@isp/contracts';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActivationFields } from '@/features/customers/activation-fields';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';

interface ApproveLeadFormProps {
  lead: LeadDto;
  onSubmit(input: ApproveLeadInput): Promise<void>;
  onCancel(): void;
}

/** Admin decision for a pending lead, including the Internet Activation Policy. */
export function ApproveLeadForm({ lead, onSubmit, onCancel }: ApproveLeadFormProps) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(approveLeadSchema),
    defaultValues: {
      packageId: lead.requestedPackageId ?? '',
      connectionType: lead.connectionType,
      activationPolicy: 'AFTER_FIRST_PAYMENT' as const,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setMessage(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setMessage(toMessage(e));
    }
  });

  return (
    <Card className="border-brand">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
          <h3 className="font-medium md:col-span-2">
            {t.leads.approveTitle}: {lead.fullName}
          </h3>
          {message && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
              {message}
            </p>
          )}
          <ActivationFields />
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t.leads.approve}
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
