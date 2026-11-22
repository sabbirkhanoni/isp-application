import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, ROLES, type CreateUserInput } from '@isp/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';

interface CreateUserFormProps {
  onSubmit(input: CreateUserInput): Promise<void>;
  onCancel(): void;
}

export function CreateUserForm({ onSubmit, onCancel }: CreateUserFormProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'STAFF' as const },
  });

  const submit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 409
          ? t.users.conflict
          : t.common.genericError,
      );
    }
  });

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
            {message}
          </p>
        )}
        <Field label={t.users.username} htmlFor="new-username" error={errors.username?.message}>
          <Input id="new-username" autoCapitalize="none" {...register('username')} />
        </Field>
        <Field label={t.users.fullName} htmlFor="new-fullName" error={errors.fullName?.message}>
          <Input id="new-fullName" {...register('fullName')} />
        </Field>
        <Field label={t.users.phone} htmlFor="new-phone" error={errors.phone?.message}>
          <Input
            id="new-phone"
            inputMode="tel"
            {...register('phone', { setValueAs: (v: string) => v || undefined })}
          />
        </Field>
        <Field label={t.users.role} htmlFor="new-role">
          <select
            id="new-role"
            className="h-10 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm"
            {...register('role')}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t.roles[role]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t.users.temporaryPassword}
          htmlFor="new-password"
          hint={t.users.temporaryPasswordHint}
          error={errors.temporaryPassword?.message}
        >
          <Input
            id="new-password"
            type="text"
            autoComplete="off"
            {...register('temporaryPassword')}
          />
        </Field>
        <div className="flex items-end gap-2">
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
