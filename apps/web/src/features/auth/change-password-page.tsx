import { zodResolver } from '@hookform/resolvers/zod';
import { MIN_PASSWORD_LENGTH } from '@isp/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './auth-context';

const formSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, 'tooShort').max(200),
  confirmPassword: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordPage() {
  const { t } = useI18n();
  const { changePassword, logout, user } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    if (values.newPassword !== values.confirmPassword) {
      setError('confirmPassword', { message: t.changePassword.mismatch });
      return;
    }
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        setMessage(t.changePassword.wrongCurrent);
      else setMessage(t.common.genericError);
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-brand">{t.appName}</h1>
          <LanguageSwitcher />
        </div>
        <Card>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <h2 className="text-lg font-medium">{t.changePassword.title}</h2>
            {user?.mustChangePassword && (
              <p className="text-sm text-slate-600">{t.changePassword.intro}</p>
            )}
            {message && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {message}
              </p>
            )}
            <Field label={t.changePassword.current} htmlFor="currentPassword">
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
            </Field>
            <Field
              label={t.changePassword.next}
              htmlFor="newPassword"
              error={errors.newPassword ? t.changePassword.tooShort : undefined}
            >
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...register('newPassword')}
              />
            </Field>
            <Field
              label={t.changePassword.confirm}
              htmlFor="confirmPassword"
              error={errors.confirmPassword?.message}
            >
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {t.changePassword.submit}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => void logout()}>
              {t.common.signOut}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
