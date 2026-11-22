import type { LineDto, LineState } from '@isp/contracts';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/i18n-context';

const TONES = { ONLINE: 'good', OFFLINE: 'bad', NEVER_SEEN: 'neutral' } as const;

/** Router data older than this is shown with a warning: the monitor polls about once a minute. */
const STALE_AFTER_MS = 5 * 60_000;

export const isStale = (line: LineDto): boolean =>
  line.routerError !== null ||
  line.routerCheckedAt === null ||
  Date.now() - new Date(line.routerCheckedAt).getTime() > STALE_AFTER_MS;

export function LineBadge({ state }: { state: LineState }) {
  const { t } = useI18n();
  return <Badge tone={TONES[state]}>{t.lines.state[state]}</Badge>;
}

/** "3h 20m" style, from the session start time. */
export function formatSince(iso: string, language: 'bn' | 'en'): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [days ? `${days}d` : '', hours ? `${hours}h` : '', `${mins}m`].filter(Boolean);
  const text = parts.join(' ');
  return language === 'bn'
    ? text.replace(/d/, ' দিন').replace(/h/, ' ঘণ্টা').replace(/m/, ' মিনিট')
    : text;
}
