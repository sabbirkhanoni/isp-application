import type { PaginationMeta } from '@isp/contracts';
import { useI18n } from '@/i18n/i18n-context';
import { Button } from './button';

interface PagerProps {
  pagination: PaginationMeta | undefined;
  onPageChange(page: number): void;
}

export function Pager({ pagination, onPageChange }: PagerProps) {
  const { t } = useI18n();
  if (!pagination) return null;
  const lastPage = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  if (lastPage <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        {t.common.previous}
      </Button>
      <span className="text-sm text-slate-600">
        {pagination.page} / {lastPage}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={pagination.page >= lastPage}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        {t.common.next}
      </Button>
    </div>
  );
}
