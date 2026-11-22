import { fiberLevel, type FiberLevel } from '@isp/contracts';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/i18n-context';

const TONE = { GOOD: 'good', WEAK: 'warn', CRITICAL: 'bad' } as const;

/** The reading with a colour: green = fine, amber = getting weak, red = below -27 dBm. */
export function FiberBadge({ rxDbm, level }: { rxDbm: number; level?: FiberLevel }) {
  const { t } = useI18n();
  const l = level ?? fiberLevel(rxDbm);
  return (
    <Badge tone={TONE[l]} title={t.fiberSignal.level[l]}>
      {rxDbm.toFixed(1)} dBm · {t.fiberSignal.level[l]}
    </Badge>
  );
}
