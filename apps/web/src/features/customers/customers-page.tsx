import { CUSTOMER_STATUSES } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  LayoutGrid,
  MapPin,
  PauseCircle,
  Phone,
  Radio,
  Search,
  Table as TableIcon,
  UserPlus,
  Users,
  UserX,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pager } from '@/components/ui/pager';
import { EmptyState, Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { CustomerForm } from './customer-form';
import { CustomerStatusBadge } from './customer-status-badge';
import { createCustomer, customersKey, fetchCustomers } from './customers-api';

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CustomersPage() {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [status, setStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(false);
  const search = useDebounced(searchText.trim());

  const list = useQuery({
    queryKey: [...customersKey, { page, search, status }],
    queryFn: () => fetchCustomers({ page, search, status }),
    placeholderData: keepPreviousData,
  });

  const countsQuery = useQuery({
    queryKey: [...customersKey, 'counts'],
    queryFn: async () => {
      const [all, active, pending, suspended, terminated] = await Promise.all([
        fetchCustomers({ page: 1, search: '', status: '' }),
        fetchCustomers({ page: 1, search: '', status: 'ACTIVE' }),
        fetchCustomers({ page: 1, search: '', status: 'PENDING_ACTIVATION' }),
        fetchCustomers({ page: 1, search: '', status: 'SUSPENDED' }),
        fetchCustomers({ page: 1, search: '', status: 'TERMINATED' }),
      ]);
      return {
        all: all.pagination.total,
        active: active.pagination.total,
        pending: pending.pagination.total,
        suspended: suspended.pagination.total,
        terminated: terminated.pagination.total,
      };
    },
  });

  const create = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customersKey });
      queryClient.invalidateQueries({ queryKey: [...customersKey, 'counts'] });
    },
  });

  const KPI_CARDS = [
    {
      targetStatus: '',
      label: t.customers.totalCustomers,
      count: countsQuery.data?.all ?? list.data?.pagination.total ?? '—',
      icon: Users,
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50 border-indigo-200',
    },
    {
      targetStatus: 'ACTIVE',
      label: t.customers.activeCustomers,
      count: countsQuery.data?.active ?? '—',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-200',
    },
    {
      targetStatus: 'PENDING_ACTIVATION',
      label: t.customers.pendingCustomers,
      count: countsQuery.data?.pending ?? '—',
      icon: Clock,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
    },
    {
      targetStatus: 'SUSPENDED',
      label: t.customers.suspendedCustomers,
      count: countsQuery.data?.suspended ?? '—',
      icon: PauseCircle,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50 border-amber-200',
    },
    {
      targetStatus: 'TERMINATED',
      label: t.customers.terminatedCustomers,
      count: countsQuery.data?.terminated ?? '—',
      icon: UserX,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50 border-red-200',
    },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.customers.title}</h1>
            <Badge tone="neutral" className="text-xs">
              {list.data?.pagination.total ?? 0}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t.customers.search}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can('CUSTOMER_IMPORT') && (
            <Link
              to="/customers/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <FileSpreadsheet className="size-4 text-emerald-600" aria-hidden="true" />
              <span>{t.customers.import.button}</span>
            </Link>
          )}
          {can('CUSTOMER_CREATE_ACTIVE') && (
            <Button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold shadow-sm"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              <span>{t.customers.add}</span>
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          <span>{t.customers.created}</span>
          <button
            type="button"
            onClick={() => setNotice(false)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 2. Top KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KPI_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = status === card.targetStatus;
          return (
            <button
              key={card.targetStatus}
              type="button"
              onClick={() => {
                setStatus(card.targetStatus);
                setPage(1);
              }}
              className={cn(
                'relative flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all',
                isSelected
                  ? 'border-brand bg-brand/5 shadow-sm ring-2 ring-brand/20'
                  : 'border-line bg-white hover:border-slate-300 hover:shadow-xs'
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500 truncate">{card.label}</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  {card.count}
                </p>
              </div>
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                  card.iconBg
                )}
              >
                <Icon className={cn('size-5', card.iconColor)} aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. Search & Filter Bar */}
      <Card className="p-3 border border-line shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchText}
              placeholder={t.customers.search}
              aria-label={t.customers.search}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-line bg-white pl-9 pr-8 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => {
                  setSearchText('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Right Toolbar: Status Tabs & View Switcher */}
          <div className="flex flex-wrap items-center gap-2 justify-between md:justify-end">
            {/* View Mode Switcher */}
            <div className="flex rounded-lg border border-line bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title={t.customers.tableView}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition',
                  viewMode === 'table'
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <TableIcon className="size-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{t.customers.tableView}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                title={t.customers.cardView}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition',
                  viewMode === 'cards'
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{t.customers.cardView}</span>
              </button>
            </div>

            {/* Desktop Status Pills */}
            <div className="hidden sm:flex rounded-lg border border-line bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setStatus('');
                  setPage(1);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1.5 transition',
                  status === ''
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {t.customers.all}
              </button>
              {CUSTOMER_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 transition',
                    status === s
                      ? 'bg-white font-semibold text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {t.enums.customerStatus[s]}
                </button>
              ))}
            </div>

            {/* Mobile Status Select */}
            <Select
              className="sm:hidden w-36 text-xs"
              aria-label={t.customers.status}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t.customers.all}</option>
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.enums.customerStatus[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* 4. Customers Data Display (Table or Cards) */}
      {list.isPending && (
        <Card className="p-0 border border-line shadow-sm">
          <Loading />
        </Card>
      )}

      {list.isError && (
        <Card className="p-6 border border-line shadow-sm">
          <p className="text-red-700">{t.common.genericError}</p>
        </Card>
      )}

      {list.data?.customers.length === 0 && (
        <Card className="p-0 border border-line shadow-sm">
          <EmptyState icon={Users} title={t.customers.empty} />
        </Card>
      )}

      {list.data && list.data.customers.length > 0 && viewMode === 'table' && (
        <Card className="overflow-hidden p-0 border border-line shadow-sm">
          {/* Mobile scroll hint */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-line text-[11px] text-slate-500 sm:hidden">
            <span>{t.customers.scrollHint}</span>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className="font-medium text-brand hover:underline"
            >
              {t.customers.cardView}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[1100px]">
              <thead className="border-b border-line bg-slate-50/80 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">{t.customers.code}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.leads.fullName}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.customers.pppoeUser} & {t.customers.router}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.customers.contact}</th>
                  <th className="px-4 py-3 whitespace-nowrap min-w-[210px]">{t.customers.package}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.customers.expiryDate}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.customers.status}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.leads.actions}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.leads.area} & {t.leads.address}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.customers.map((c) => {
                  const startDate = c.billingPeriod?.startDate ?? c.createdAt.slice(0, 10);
                  const expiryDate = c.billingPeriod?.expiryDate ?? c.createdAt.slice(0, 10);
                  return (
                    <tr key={c.id} className="transition hover:bg-slate-50/70">
                      {/* 1. Customer Code / ID */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <Link
                          className="font-mono text-xs font-bold text-brand hover:underline px-2 py-1 bg-brand/5 rounded border border-brand/20 inline-block"
                          to={`/customers/${c.id}`}
                        >
                          {c.customerCode}
                        </Link>
                      </td>

                      {/* 2. Full Name */}
                      <td className="px-4 py-3 align-top min-w-[150px]">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <Link to={`/customers/${c.id}`} className="hover:text-brand">
                            {c.fullName}
                          </Link>
                          {c.isFree && (
                            <Badge tone="good" className="text-[10px] px-1.5 py-0">
                              {t.free.badge}
                            </Badge>
                          )}
                        </div>
                        {c.note && (
                          <div className="text-[11px] text-slate-400 italic truncate max-w-[180px] mt-0.5">
                            {c.note}
                          </div>
                        )}
                      </td>

                      {/* 3. PPPoE Username & Router */}
                      <td className="px-4 py-3 align-top min-w-[160px]">
                        {c.subscription?.pppoeUsername ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs font-semibold border border-slate-200">
                            {c.subscription.pppoeUsername}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                        {c.subscription?.routerName && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[150px] mt-1 flex items-center gap-1">
                            <Radio className="size-3 text-slate-400 shrink-0" />
                            <span>{c.subscription.routerName}</span>
                          </div>
                        )}
                      </td>

                      {/* 4. Contact (Phone) */}
                      <td className="px-4 py-3 align-top whitespace-nowrap min-w-[140px]">
                        <div className="flex flex-col gap-0.5">
                          <a
                            href={`tel:${c.phone}`}
                            className="font-mono text-xs text-slate-800 hover:text-brand inline-flex items-center gap-1 font-medium"
                          >
                            <Phone className="size-3 text-slate-400" />
                            {c.phone}
                          </a>
                          {c.altPhone && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              বিকল্প: {c.altPhone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Package Info (2 lines: Package Name & Connection Type) */}
                      <td className="px-4 py-3 align-top min-w-[210px]">
                        <div className="font-semibold text-slate-900 whitespace-nowrap text-sm">
                          {c.subscription?.packageName ?? '—'}
                        </div>
                        {c.subscription && (
                          <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                            <Wifi className="size-3 text-slate-400 shrink-0" />
                            <span>{t.enums.connectionType[c.subscription.connectionType]}</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Expiry Date (startDate --> expiryDate) */}
                      <td className="px-4 py-3 align-top whitespace-nowrap min-w-[190px]">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                          <Calendar className="size-3 text-slate-400 shrink-0" />
                          <span className="text-slate-600">{startDate}</span>
                          <span className="text-slate-400 font-sans mx-0.5 font-bold">→</span>
                          <span className="font-semibold text-slate-900">{expiryDate}</span>
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td className="px-4 py-3 align-top whitespace-nowrap min-w-[110px]">
                        <CustomerStatusBadge status={c.status} />
                        {c.status === 'SUSPENDED' && c.suspendReason && (
                          <p className="mt-1 text-[11px] text-amber-700 max-w-[140px] leading-tight">
                            {c.suspendReason === 'NON_PAYMENT'
                              ? t.customers.reasonNonPayment
                              : t.customers.reasonManual}
                          </p>
                        )}
                      </td>

                      {/* 8. Actions (without phone button) */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <Link
                          to={`/customers/${c.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand shadow-2xs transition"
                        >
                          <span>{t.customers.viewProfile}</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>

                      {/* 9. Area & Address (Very last column) */}
                      <td className="px-4 py-3 align-top min-w-[200px]">
                        <div className="text-xs text-slate-700 flex items-start gap-1.5">
                          <MapPin className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            {c.area && (
                              <span className="font-semibold text-slate-900">{c.area} · </span>
                            )}
                            <span className="text-slate-600">{c.address}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 5. Mobile Cards View */}
      {list.data && list.data.customers.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {list.data.customers.map((c) => {
            const startDate = c.billingPeriod?.startDate ?? c.createdAt.slice(0, 10);
            const expiryDate = c.billingPeriod?.expiryDate ?? c.createdAt.slice(0, 10);
            return (
              <Card
                key={c.id}
                className="p-4 border border-line shadow-sm hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/customers/${c.id}`}
                          className="font-mono text-xs font-semibold text-brand hover:underline px-1.5 py-0.5 bg-brand/5 rounded"
                        >
                          {c.customerCode}
                        </Link>
                        {c.isFree && (
                          <Badge tone="good" className="text-[10px] px-1.5 py-0">
                            {t.free.badge}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 text-base mt-1">{c.fullName}</h3>
                    </div>
                    <CustomerStatusBadge status={c.status} />
                  </div>

                  {/* Details */}
                  <div className="mt-3 space-y-2 text-xs">
                    {/* Phone */}
                    <div className="flex items-center justify-between text-slate-600">
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1.5 font-mono text-slate-700 hover:text-brand"
                      >
                        <Phone className="size-3.5 text-slate-400" />
                        <span>{c.phone}</span>
                      </a>
                      {c.altPhone && (
                        <span className="text-[11px] text-slate-400">বিকল্প: {c.altPhone}</span>
                      )}
                    </div>

                    {/* Area & Address */}
                    <div className="flex items-start gap-2 text-slate-600">
                      <MapPin className="size-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        {c.area && <span className="font-medium text-slate-800">{c.area} · </span>}
                        <span>{c.address}</span>
                      </div>
                    </div>

                    {/* PPPoE Username & Router */}
                    {c.subscription?.pppoeUsername && (
                      <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-100">
                        <span>{t.customers.pppoeUser}:</span>
                        <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                          {c.subscription.pppoeUsername}
                        </span>
                      </div>
                    )}
                    {c.subscription?.routerName && (
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{t.customers.router}:</span>
                        <span className="text-slate-700 font-medium">
                          {c.subscription.routerName}
                        </span>
                      </div>
                    )}

                    {/* Package */}
                    <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Wifi className="size-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800">
                          {c.subscription?.packageName ?? '—'}
                        </span>
                      </div>
                      {c.subscription && (
                        <span className="text-slate-500 text-[11px]">
                          {t.enums.connectionType[c.subscription.connectionType]}
                        </span>
                      )}
                    </div>

                    {/* Expiry Date */}
                    <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-100">
                      <span className="text-slate-500">{t.customers.expiryDate}:</span>
                      <span className="font-mono text-xs bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {startDate} <span className="text-slate-400">→</span>{' '}
                        <span className="font-semibold text-slate-900">{expiryDate}</span>
                      </span>
                    </div>

                    {/* Suspend Reason */}
                    {c.status === 'SUSPENDED' && c.suspendReason && (
                      <div className="mt-2 rounded bg-amber-50 p-2 text-amber-700 border border-amber-200 text-[11px]">
                        {c.suspendReason === 'NON_PAYMENT'
                          ? t.customers.reasonNonPayment
                          : t.customers.reasonManual}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-line/60">
                  <Link
                    to={`/customers/${c.id}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-brand text-xs font-semibold text-white hover:bg-brand/90 shadow-2xs transition"
                  >
                    <span>{t.customers.viewProfile}</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pager pagination={list.data?.pagination} onPageChange={setPage} />

      {/* 6. "গ্রাহক যোগ করুন" Modal Dialog */}
      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity"
            onClick={() => setShowForm(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {t.customers.newCustomerModalTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.customers.newCustomerModalDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <CustomerForm
              className="border-0 p-0 shadow-none bg-transparent"
              onCancel={() => setShowForm(false)}
              onSubmit={async (input) => {
                await create.mutateAsync(input);
                setShowForm(false);
                setNotice(true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
