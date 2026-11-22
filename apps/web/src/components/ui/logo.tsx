import { cn } from '@/lib/cn';

/** Four rising bars, like a signal meter: the mark of a connection business. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-xl bg-brand shadow-sm shadow-brand/40',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
        <rect x="3" y="14" width="3.5" height="6" rx="1.2" />
        <rect x="8.5" y="10" width="3.5" height="10" rx="1.2" />
        <rect x="14" y="6" width="3.5" height="14" rx="1.2" />
        <rect x="19.5" y="3" width="1.5" height="17" rx="0.75" opacity="0.55" />
      </svg>
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark"
    >
      {initials || '?'}
    </span>
  );
}
