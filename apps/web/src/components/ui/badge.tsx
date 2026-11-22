import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-600',
        good: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
        warn: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
        bad: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
