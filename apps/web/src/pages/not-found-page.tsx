import { useI18n } from '@/i18n/i18n-context';

export function NotFoundPage() {
  const { t } = useI18n();
  return <p className="p-8 text-slate-600">{t.errors.notFound}</p>;
}
