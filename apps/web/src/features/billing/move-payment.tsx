import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchCustomers } from '@/features/customers/customers-api';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';

interface Props {
  customerId: string;
  onMove(toCustomerId: string, reason: string): Promise<void>;
  onCancel(): void;
}

/** Find the customer who really paid, give a reason, and move the payment there. */
export function MovePayment({ customerId, onMove, onCancel }: Props) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const found = useQuery({
    queryKey: ['customers', 'picker', search],
    queryFn: () => fetchCustomers({ page: 1, search, status: '' }),
    enabled: search.trim().length >= 2,
  });
  const move = useMutation({
    mutationFn: (toId: string) => onMove(toId, reason.trim()),
    onError: (e) => setError(toMessage(e)),
  });
  const options = (found.data?.customers ?? []).filter((c) => c.id !== customerId).slice(0, 6);

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-600">{t.extras.moveHint}</p>
      <Input
        aria-label={t.extras.moveSearch}
        placeholder={t.extras.moveSearch}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Input
        aria-label={t.billing.reverseReason}
        placeholder={t.billing.reverseReason}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {options.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span>
              {c.customerCode} · {c.fullName} · {c.phone}
            </span>
            <Button
              size="sm"
              disabled={reason.trim().length < 3 || move.isPending}
              onClick={() => move.mutate(c.id)}
            >
              {t.extras.moveHere}
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" onClick={onCancel}>
        {t.common.cancel}
      </Button>
    </div>
  );
}
