import type { InvoiceStatus } from '@isp/contracts';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/i18n-context';

const TONES = { ISSUED: 'warn', PARTIALLY_PAID: 'warn', PAID: 'good', VOID: 'neutral' } as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONES[status]}>{t.billing.status[status]}</Badge>;
}
