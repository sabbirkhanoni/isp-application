import type { Language } from '@isp/contracts';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';

const OPTIONS: ReadonlyArray<{ value: Language; label: string }> = [
  { value: 'bn', label: 'বাংলা' },
  { value: 'en', label: 'EN' },
];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  const { user, savePreferredLanguage } = useAuth();

  const choose = (next: Language) => {
    setLanguage(next);
    if (user) void savePreferredLanguage(next);
  };

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className="inline-flex rounded-xl border border-line bg-surface p-0.5 shadow-sm"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={language === option.value}
          onClick={() => choose(option.value)}
          className={cn(
            'rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-colors',
            language === option.value
              ? 'bg-brand text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
