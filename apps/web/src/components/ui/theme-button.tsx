import { Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/i18n-context';
import { useTheme } from '@/lib/theme';

export function ThemeButton() {
  const { t } = useI18n();
  const { resolved, toggle } = useTheme();
  const Icon = resolved === 'dark' ? Sun : Moon;
  const label = resolved === 'dark' ? t.theme.toLight : t.theme.toDark;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-slate-600 shadow-sm transition hover:bg-slate-50"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
