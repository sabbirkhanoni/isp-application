import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-xl border border-slate-300/80 bg-surface px-3 text-sm shadow-sm transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-brand focus-visible:outline-0 focus-visible:ring-4 focus-visible:ring-brand/15 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
