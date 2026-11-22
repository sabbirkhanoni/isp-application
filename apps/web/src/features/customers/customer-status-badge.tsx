import type { CustomerStatus } from '@isp/contracts';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/i18n-context';

const TONES = {
  ACTIVE: 'good',
  PENDING_ACTIVATION: 'warn',
  SUSPENDED: 'bad',
  TERMINATED: 'neutral',
} as const;

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONES[status]}>{t.enums.customerStatus[status]}</Badge>;
}
