import type { ReportSummaryDto } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  HandCoins,
  PauseCircle,
  PiggyBank,
  Cable,
  Radio,
  Smartphone,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchFiber, fiberKey } from '@/features/olt/olt-api';
import { Loading, PageHeader, StatCard } from '@/components/ui/page';
import { collectorsKey, fetchMyCollection } from '@/features/admin/collectors-api';
import { ProgressBar } from '@/features/admin/collectors-page';
import { useAuth } from '@/features/auth/auth-context';
import { fetchLines, linesKey } from '@/features/network/network-api';
import { collectionsCsvUrl, fetchSummary, reportsKey } from '@/features/reports/reports-api';
import { TrendChart } from '@/features/reports/trend-chart';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

/** Stacked bars (cash + bKash) per day; plain CSS so no chart library is needed. */
function DailyBars({ daily }: { daily: ReportSummaryDto['daily'] }) {
  const { t, language } = useI18n();
  const max = Math.max(1, ...daily.map((d) => d.cashPoisha + d.bkashPoisha));
  if (daily.length === 0)
    return <p className="py-6 text-center text-sm text-slate-500">{t.dashboard.noCollections}</p>;
  return (
    <div>
      <div className="flex h-40 items-end gap-1" role="img" aria-label={t.dashboard.daily}>
        {daily.map((d) => {
          const total = d.cashPoisha + d.bkashPoisha;
          return (
            <div
              key={d.date}
              className="flex h-full min-w-[6px] flex-1 flex-col justify-end"
              title={`${d.date}: ${formatMoney(total, language)}`}
            >
              <div
                className="rounded-t-sm bg-pink-500"
                style={{ height: `${(d.bkashPoisha / max) * 100}%` }}
              />
              <div
                className="bg-emerald-600"
                style={{ height: `${(d.cashPoisha / max) * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-sm bg-emerald-600" /> {t.dashboard.cash}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-sm bg-pink-500" /> {t.dashboard.bkash}
        </span>
      </div>
    </div>
  );
}

/** The one number the owner opens the app for: how much of this month's bill has come in. */
function CollectionHero({ data }: { data: ReportSummaryDto }) {
  const { t, language } = useI18n();
  const money = (v: number) => formatMoney(v, language);
  const { invoicedPoisha, collectedPoisha, collectedCashPoisha, collectedBkashPoisha } =
    data.billing;
  const pct =
    invoicedPoisha > 0 ? Math.min(100, Math.round((collectedPoisha / invoicedPoisha) * 100)) : 0;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-card sm:p-8">
      <svg
        aria-hidden="true"
        viewBox="0 0 400 400"
        className="pointer-events-none absolute -right-20 -top-24 size-80 text-brand/20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="200" cy="200" r="60" />
        <circle cx="200" cy="200" r="110" />
        <circle cx="200" cy="200" r="160" />
      </svg>
      <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{t.dashboard.collected}</p>
          <p className="text-4xl font-bold tracking-tight sm:text-5xl">{money(collectedPoisha)}</p>
          <p className="text-sm text-slate-400">
            {t.dashboard.ofBilled.replace('{amount}', money(invoicedPoisha))}
          </p>
          <div
            className="h-2.5 max-w-md overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex gap-6 text-sm sm:flex-col sm:gap-3 sm:text-right">
          <div>
            <p className="text-3xl font-bold text-brand">{pct}%</p>
            <p className="text-xs text-slate-400">{t.dashboard.collectedShare}</p>
          </div>
          <div className="space-y-0.5 text-slate-300">
            <p>
              {t.dashboard.cash}: <b className="text-white">{money(collectedCashPoisha)}</b>
            </p>
            <p>
              {t.dashboard.bkash}: <b className="text-white">{money(collectedBkashPoisha)}</b>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AttentionItem({
  to,
  icon: Icon,
  label,
  count,
  tone,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count: number;
  tone: 'warn' | 'bad';
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:bg-slate-50"
    >
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-lg',
          tone === 'bad' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-lg font-bold">{count}</span>
    </Link>
  );
}

function AdminDashboard() {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState('');
  const summary = useQuery({
    queryKey: [...reportsKey, 'summary', period],
    queryFn: () => fetchSummary(period),
  });
  const lines = useQuery({
    queryKey: [...linesKey, 'dashboard'],
    queryFn: () => fetchLines({ filter: 'ALL', search: '', page: 1 }),
    refetchInterval: 60_000,
  });
  const fiber = useQuery({
    queryKey: [...fiberKey, 'dashboard'],
    queryFn: () => fetchFiber({ filter: 'CRITICAL', search: '', page: 1 }),
    refetchInterval: 60_000,
  });
  const lineSummary = lines.data?.summary;
  const data = summary.data;
  const money = (poisha: number) => formatMoney(poisha, language);
  const totalCustomers = data
    ? data.customers.active +
      data.customers.pendingActivation +
      data.customers.suspended +
      (data.customers.terminated ?? 0)
    : 0;
  const attention = data
    ? [
        {
          to: '/billing/bkash',
          icon: Smartphone,
          label: t.dashboard.bkashReview,
          count: data.attention.bkashNeedsReview,
          tone: 'warn' as const,
        },
        {
          to: '/admin/routers',
          icon: AlertTriangle,
          label: t.dashboard.routerFailures,
          count: data.attention.failedRouterJobs,
          tone: 'bad' as const,
        },
        {
          to: '/network/fiber',
          icon: Cable,
          label: t.dashboard.fiberCritical,
          count: fiber.data?.summary.critical ?? 0,
          tone: 'bad' as const,
        },
        {
          to: '/network/lines',
          icon: Radio,
          label: t.lines.activeButOffline,
          count: lineSummary?.activeButOffline ?? 0,
          tone: 'warn' as const,
        },
      ].filter((item) => item.count > 0)
    : [];
  const onlinePct =
    lineSummary && lineSummary.managed > 0
      ? Math.round((lineSummary.online / lineSummary.managed) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {t.dashboard.month}
          <Input
            type="month"
            className="w-44"
            value={period || data?.period || ''}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <a href={collectionsCsvUrl(period || data?.period || '')}>
          <Button variant="outline" size="sm" type="button">
            <Download className="size-4" aria-hidden="true" />
            {t.dashboard.exportCollections}
          </Button>
        </a>
      </div>

      {summary.isPending && <Loading rows={5} />}
      {summary.isError && <p className="text-red-700">{t.common.genericError}</p>}

      {data && (
        <>
          <CollectionHero data={data} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              tone="neutral"
              label={t.dashboard.invoiced}
              value={money(data.billing.invoicedPoisha)}
            />
            <StatCard
              icon={Wallet}
              tone="warn"
              label={t.dashboard.outstanding}
              value={money(data.billing.outstandingPoisha)}
            />
            <Link to="/billing/dues" className="contents">
              <StatCard
                icon={HandCoins}
                tone="bad"
                label={t.dashboard.overdue}
                value={money(data.billing.overduePoisha)}
                hint={`${data.billing.overdueCustomers} ${t.dashboard.overdueCustomers}`}
              />
            </Link>
            <StatCard
              icon={PiggyBank}
              tone="good"
              label={t.dashboard.credit}
              value={money(data.billing.customerCreditPoisha)}
            />
          </div>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{t.dashboard.customers}</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {t.dashboard.totalCustomers}: {totalCustomers}
                </span>
              </div>
              <Link to="/customers" className="text-xs font-medium text-brand hover:underline">
                {t.customers.title} →
              </Link>
            </div>
            <div
              className={cn(
                'grid grid-cols-2 gap-3',
                data.customers.terminated > 0 ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4',
              )}
            >
              <Link
                to="/customers"
                className="rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <Users className="size-5 text-brand" aria-hidden="true" />
                <p className="mt-2 text-2xl font-bold text-slate-900">{totalCustomers}</p>
                <p className="text-xs text-slate-500">{t.dashboard.totalCustomers}</p>
              </Link>
              <Link
                to="/customers"
                className="rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <UserCheck className="size-5 text-emerald-600" aria-hidden="true" />
                <p className="mt-2 text-2xl font-bold text-slate-900">{data.customers.active}</p>
                <p className="text-xs text-slate-500">{t.dashboard.activeCustomers}</p>
              </Link>
              <Link
                to="/customers"
                className="rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <UserPlus className="size-5 text-amber-600" aria-hidden="true" />
                <p className="mt-2 text-2xl font-bold text-slate-900">{data.customers.pendingActivation}</p>
                <p className="text-xs text-slate-500">{t.dashboard.pendingCustomers}</p>
              </Link>
              <Link
                to="/customers"
                className="rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <PauseCircle className="size-5 text-red-600" aria-hidden="true" />
                <p className="mt-2 text-2xl font-bold text-slate-900">{data.customers.suspended}</p>
                <p className="text-xs text-slate-500">{t.dashboard.suspendedCustomers}</p>
              </Link>
              {data.customers.terminated > 0 && (
                <Link
                  to="/customers"
                  className="rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
                >
                  <UserX className="size-5 text-slate-400" aria-hidden="true" />
                  <p className="mt-2 text-2xl font-bold text-slate-600">
                    {data.customers.terminated}
                  </p>
                  <p className="text-xs text-slate-500">{t.dashboard.terminatedCustomers}</p>
                </Link>
              )}
            </div>
            {lineSummary && lineSummary.managed > 0 && (
              <div className="space-y-2 border-t border-line pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <Radio className="size-4 text-brand" aria-hidden="true" />
                    {t.dashboard.linesTitle}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {lineSummary.online} / {lineSummary.managed} {t.lines.online} ({onlinePct}%)
                    </span>
                  </span>
                  <Link to="/network/lines" className="text-brand hover:underline">
                    {t.dashboard.linesOpen}
                  </Link>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="bg-emerald-500" style={{ width: `${onlinePct}%` }} />
                </div>
                <p className="text-sm text-slate-600">
                  <b className="text-emerald-600">{lineSummary.online}</b> {t.lines.online} ·{' '}
                  <b className="text-slate-700">{lineSummary.offline}</b> {t.lines.offline}
                  <span className="ml-1 text-xs text-slate-500">
                    ({t.dashboard.totalLines}: {lineSummary.managed})
                  </span>
                </p>
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t.dashboard.attention}</h2>
              {attention.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  {attention.length} {t.dashboard.attention}
                </span>
              )}
            </div>
            {attention.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-slate-500">
                <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
                <p className="text-sm">{t.dashboard.allClear}</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {attention.map((item) => (
                  <AttentionItem key={item.to} {...item} />
                ))}
              </div>
            )}
          </Card>

          <TrendChart />

          <Card className="space-y-3">
            <h2 className="font-semibold">{t.dashboard.daily}</h2>
            <DailyBars daily={data.daily} />
          </Card>
        </>
      )}
    </div>
  );
}

function MyCollection() {
  const { t, language } = useI18n();
  const query = useQuery({ queryKey: [...collectorsKey, 'mine'], queryFn: fetchMyCollection });
  const row = query.data;
  if (!row) return null;
  const money = (v: number) => formatMoney(v, language);
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{t.insights.myCollection}</h2>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">{t.insights.customers}</p>
          <p className="text-xl font-bold">{row.customers}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.insights.collected}</p>
          <p className="text-xl font-bold">{money(row.collectedPoisha)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.insights.outstanding}</p>
          <p className="text-xl font-bold">{money(row.outstandingPoisha)}</p>
        </div>
      </div>
      {row.targetPoisha ? (
        <div className="space-y-1">
          <ProgressBar done={row.collectedPoisha} target={row.targetPoisha} />
          <p className="text-xs text-slate-500">
            {t.insights.target}: {money(row.targetPoisha)}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand/50"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { t, language } = useI18n();
  const { user, can } = useAuth();
  const today = new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Dhaka',
  }).format(new Date());
  return (
    <div className="space-y-6">
      <PageHeader title={`${t.dashboard.welcome}, ${user?.fullName ?? ''}`} description={today} />
      {can('INVOICE_READ') && <MyCollection />}
      {can('FINANCE_REPORT_READ') ? (
        <AdminDashboard />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {can('CUSTOMER_READ') && (
            <QuickLink to="/customers" icon={Users} label={t.nav.customers} />
          )}
          {can('INVOICE_READ') && (
            <QuickLink to="/billing/dues" icon={HandCoins} label={t.dashboard.viewDues} />
          )}
        </div>
      )}
    </div>
  );
}
