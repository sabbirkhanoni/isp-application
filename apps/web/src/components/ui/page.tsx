import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';

/** Title row used at the top of every screen: one place for heading, one-line help and the main actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Placeholder rows while data loads: shows the shape of the page instead of a bare "Loading". */
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn('space-y-3 p-1', className)} role="status" aria-busy="true">
      <span className="sr-only">{t.common.loading}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-xl bg-slate-100"
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  );
}

/** An empty screen is an invitation to act: say what is missing and, if possible, how to fix it. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="font-semibold text-slate-800">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

type Tone = 'brand' | 'good' | 'warn' | 'bad' | 'neutral';
const TONES: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-600',
  bad: 'bg-red-50 text-red-600',
  neutral: 'bg-slate-100 text-slate-500',
};

/** A number worth a glance: icon chip, label, value and an optional note underneath. */
export function StatCard({
  icon: Icon,
  tone = 'brand',
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
        <p className="truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
