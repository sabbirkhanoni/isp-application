import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowDown, ArrowUp, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { useI18n } from '@/i18n/i18n-context';
import { fetchMac, fetchTraffic, kickLine, lockMac, pingLine, resetMac } from './live-api';

const HISTORY = 40;
const POLL_MS = 2500;

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong';
}

/** Tiny line chart of the last readings; scales to the busiest reading. */
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const max = Math.max(1, ...values);
  const step = 100 / (HISTORY - 1);
  const points = values
    .map((v, i) => `${(HISTORY - values.length + i) * step},${28 - (v / max) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        className={tone}
        stroke="currentColor"
      />
    </svg>
  );
}

function SpeedTile({
  label,
  mbps,
  history,
  icon,
  tone,
}: {
  label: string;
  mbps: number;
  history: number[];
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums tracking-tight">{mbps.toFixed(1)}</span>
        <span className="text-xs text-slate-500">Mbps</span>
      </div>
      <Sparkline values={history} tone={tone} />
    </div>
  );
}

export function LiveLinePanel({ customerId, online }: { customerId: string; online: boolean }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = can('ROUTER_CONFIG_WRITE');
  const [down, setDown] = useState<number[]>([]);
  const [up, setUp] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const lastStamp = useRef(0);

  const traffic = useQuery({
    queryKey: ['live-traffic', customerId],
    queryFn: () => fetchTraffic(customerId),
    enabled: online,
    refetchInterval: POLL_MS,
    retry: false,
  });
  useEffect(() => {
    if (!traffic.data || traffic.dataUpdatedAt === lastStamp.current) return;
    lastStamp.current = traffic.dataUpdatedAt;
    const d = traffic.data.downloadMbps;
    const u = traffic.data.uploadMbps;
    setDown((prev) => [...prev, d].slice(-HISTORY));
    setUp((prev) => [...prev, u].slice(-HISTORY));
  }, [traffic.data, traffic.dataUpdatedAt]);

  const mac = useQuery({
    queryKey: ['live-mac', customerId],
    queryFn: () => fetchMac(customerId),
    retry: false,
  });

  const ping = useMutation({ mutationFn: () => pingLine(customerId) });
  const kick = useMutation({
    mutationFn: () => kickLine(customerId),
    onSuccess: () => {
      setNotice({ ok: true, text: t.live.kicked });
      void queryClient.invalidateQueries({ queryKey: ['lines'] });
    },
    onError: (e) => setNotice({ ok: false, text: errorText(e) }),
  });
  const changeMac = useMutation({
    mutationFn: (action: 'lock' | 'reset') =>
      action === 'lock' ? lockMac(customerId) : resetMac(customerId),
    onSuccess: (data) => {
      queryClient.setQueryData(['live-mac', customerId], data);
      setNotice({ ok: true, text: data.lockedMac ? t.live.macLocked : t.live.macReset });
    },
    onError: (e) => setNotice({ ok: false, text: errorText(e) }),
  });

  const result = ping.data;
  const lossTone = !result
    ? 'neutral'
    : result.lossPercent === 0
      ? 'good'
      : result.lossPercent < 20
        ? 'warn'
        : 'bad';
  const unavailable = traffic.isError && online ? errorText(traffic.error) : null;

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {online && !unavailable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SpeedTile
            label={t.live.download}
            mbps={traffic.data?.downloadMbps ?? 0}
            history={down}
            icon={<ArrowDown className="size-3.5" />}
            tone="text-brand"
          />
          <SpeedTile
            label={t.live.upload}
            mbps={traffic.data?.uploadMbps ?? 0}
            history={up}
            icon={<ArrowUp className="size-3.5" />}
            tone="text-amber-500"
          />
        </div>
      )}
      {unavailable && <p className="text-xs text-slate-500">{unavailable}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!online || ping.isPending}
          onClick={() => ping.mutate()}
        >
          <Activity className="mr-1.5 size-4" />
          {ping.isPending ? t.live.pinging : t.live.ping}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={kick.isPending}
          onClick={() => {
            if (window.confirm(t.live.kickConfirm)) kick.mutate();
          }}
        >
          <RefreshCw className="mr-1.5 size-4" />
          {t.live.kick}
        </Button>
        {result && (
          <Badge tone={lossTone}>
            {t.live.loss}: {result.lossPercent}%
            {result.avgMs !== null && ` · ${result.avgMs.toFixed(0)} ms`}
          </Badge>
        )}
        {ping.isError && <span className="text-xs text-red-600">{errorText(ping.error)}</span>}
      </div>

      {mac.data && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {mac.data.lockedMac ? (
            <Lock className="size-4 text-emerald-600" />
          ) : (
            <LockOpen className="size-4 text-slate-400" />
          )}
          <span className="text-slate-600">
            {mac.data.lockedMac
              ? `${t.live.lockedTo}: `
              : `${t.live.notLocked} · ${t.live.currentMac}: `}
            <span className="font-mono">{mac.data.lockedMac ?? mac.data.currentMac ?? '–'}</span>
          </span>
          {isAdmin && (
            <>
              {!mac.data.lockedMac && mac.data.currentMac && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={changeMac.isPending}
                  onClick={() => changeMac.mutate('lock')}
                >
                  {t.live.lock}
                </Button>
              )}
              {mac.data.lockedMac && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={changeMac.isPending}
                  onClick={() => {
                    if (window.confirm(t.live.resetConfirm)) changeMac.mutate('reset');
                  }}
                >
                  {t.live.reset}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {notice && (
        <p className={notice.ok ? 'text-xs text-emerald-700' : 'text-xs text-red-600'}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
