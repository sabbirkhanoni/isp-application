import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@isp/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/ui/logo';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { useAuth } from './auth-context';

export function LoginPage() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await login(values);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED')
        setMessage(t.login.rateLimited);
      else if (error instanceof ApiError && error.status === 0) setMessage(t.common.networkError);
      else if (error instanceof ApiError && error.status === 401) setMessage(t.login.invalid);
      else setMessage(t.common.genericError);
    }
  });

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_32rem]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="text-lg font-bold tracking-tight">{t.appName}</span>
        </div>
        <div className="max-w-md space-y-4">
          <p className="text-4xl font-bold leading-tight tracking-tight">{t.login.tagline}</p>
          <p className="text-slate-400">{t.login.taglineSub}</p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -bottom-24 -right-24 size-[28rem] text-brand/25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="200" cy="200" r="60" />
          <circle cx="200" cy="200" r="110" />
          <circle cx="200" cy="200" r="160" />
          <circle cx="200" cy="200" r="195" />
        </svg>
      </section>
      <section className="flex items-center justify-center p-5">
        <div className="w-full max-w-sm space-y-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 lg:invisible">
              <LogoMark className="size-8" />
              <span className="font-bold tracking-tight">{t.appName}</span>
            </span>
            <LanguageSwitcher />
          </div>
          <Card className="p-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <h1 className="text-xl font-bold">{t.login.title}</h1>
              {message && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {message}
                </p>
              )}
              <Field label={t.login.username} htmlFor="username">
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  {...register('username')}
                />
              </Field>
              <Field label={t.login.password} htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t.common.loading : t.login.submit}
              </Button>
            </form>
          </Card>
        </div>
      </section>
    </main>
  );
}
