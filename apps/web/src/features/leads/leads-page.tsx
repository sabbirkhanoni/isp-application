import { LEAD_STATUSES, type LeadDto } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  LayoutGrid,
  MapPin,
  Phone,
  Table as TableIcon,
  User,
  UserPlus,
  Users,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pager } from '@/components/ui/pager';
import { Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { customersKey } from '@/features/customers/customers-api';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { ApproveLeadForm } from './approve-lead-form';
import { LeadForm } from './lead-form';
import { approveLead, createLead, fetchLeads, leadsKey, rejectLead } from './leads-api';

const TONES = { PENDING: 'warn', APPROVED: 'good', REJECTED: 'bad' } as const;

export function LeadsPage() {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [approving, setApproving] = useState<LeadDto | null>(null);
  const [rejecting, setRejecting] = useState<LeadDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...leadsKey, { page, status }],
    queryFn: () => fetchLeads(page, status),
    placeholderData: keepPreviousData,
  });

  const countsQuery = useQuery({
    queryKey: [...leadsKey, 'counts'],
    queryFn: async () => {
      const [all, pending, approved, rejected] = await Promise.all([
        fetchLeads(1, ''),
        fetchLeads(1, 'PENDING'),
        fetchLeads(1, 'APPROVED'),
        fetchLeads(1, 'REJECTED'),
      ]);
      return {
        all: all.pagination.total,
        pending: pending.pagination.total,
        approved: approved.pagination.total,
        rejected: rejected.pagination.total,
      };
    },
  });
  const counts = countsQuery.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: leadsKey });

  const create = useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      refresh();
      setNotice(t.leads.created);
    },
  });

  const approve = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof approveLead>[1] }) =>
      approveLead(id, input),
    onSuccess: () =>
      Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: customersKey })]),
  });

  const reject = useMutation({
    mutationFn: ({ id }: { id: string }) => rejectLead(id),
    onSuccess: refresh,
  });

  const canReview = can('LEAD_APPROVE');

  const doReject = async () => {
    if (!rejecting) return;
    setError(null);
    try {
      await reject.mutateAsync({ id: rejecting.id });
      setRejecting(null);
      setNotice(t.leads.rejected);
    } catch (e) {
      setError(toMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.leads.title}</h1>
          <p className="text-sm text-slate-500">
            {language === 'bn'
              ? 'নতুন গ্রাহক সংযোগের আবেদন তৈরি ও অনুমোদন সংক্রান্ত সকল কাজ এখান থেকেই পরিচালনা করুন।'
              : 'Manage and approve incoming customer connection requests.'}
          </p>
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="size-4" />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-600 hover:text-red-900">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 2. CRM Metrics Cards (Click to Filter) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
          className={cn(
            'flex flex-col text-left rounded-xl border p-4 transition shadow-sm',
            status === ''
              ? 'border-brand bg-brand-soft/60 ring-2 ring-brand/30 shadow-brand/10'
              : 'border-line bg-white hover:bg-slate-50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">{t.leads.totalRequests}</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{counts?.all ?? '…'}</p>
          <span className="text-[11px] text-slate-500 mt-1">
            {language === 'bn' ? 'সব মিলিয়ে মোট আবেদন' : 'All submitted requests'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus('PENDING');
            setPage(1);
          }}
          className={cn(
            'flex flex-col text-left rounded-xl border p-4 transition shadow-sm',
            status === 'PENDING'
              ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/30'
              : 'border-line bg-white hover:bg-slate-50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">{t.leads.pendingRequests}</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock className="size-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-800">{counts?.pending ?? '…'}</p>
          <span className="text-[11px] text-amber-700/80 mt-1">
            {language === 'bn' ? 'অনুমোদনের অপেক্ষায় রয়েছে' : 'Needs your review'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus('APPROVED');
            setPage(1);
          }}
          className={cn(
            'flex flex-col text-left rounded-xl border p-4 transition shadow-sm',
            status === 'APPROVED'
              ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/30'
              : 'border-line bg-white hover:bg-slate-50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">{t.leads.approvedRequests}</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-800">{counts?.approved ?? '…'}</p>
          <span className="text-[11px] text-emerald-700/80 mt-1">
            {language === 'bn' ? 'সফলভাবে গ্রাহক তৈরি হয়েছে' : 'Converted to customers'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatus('REJECTED');
            setPage(1);
          }}
          className={cn(
            'flex flex-col text-left rounded-xl border p-4 transition shadow-sm',
            status === 'REJECTED'
              ? 'border-red-500 bg-red-50/80 ring-2 ring-red-500/30'
              : 'border-line bg-white hover:bg-slate-50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700">{t.leads.rejectedRequests}</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <XCircle className="size-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-800">{counts?.rejected ?? '…'}</p>
          <span className="text-[11px] text-red-700/80 mt-1">
            {language === 'bn' ? 'বাতিলকৃত আবেদন' : 'Cancelled requests'}
          </span>
        </button>
      </div>

      {/* 3. Always-Open Quick Entry Form */}
      <LeadForm
        onSubmit={async (input) => {
          await create.mutateAsync(input);
        }}
      />

      {/* 4. Requests Data Table Section */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{t.leads.listTitle}</h2>
            {list.data && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {list.data.pagination.total} {language === 'bn' ? 'টি' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title={t.leads.tableView}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition',
                  viewMode === 'table'
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <TableIcon className="size-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{t.leads.tableView}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                title={t.leads.cardView}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition',
                  viewMode === 'cards'
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{t.leads.cardView}</span>
              </button>
            </div>
            <div className="hidden sm:flex rounded-lg border border-line bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setStatus(''); setPage(1); }}
                className={cn('rounded-md px-3 py-1.5 transition', status === '' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
              >
                {t.leads.all}
              </button>
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={cn('rounded-md px-3 py-1.5 transition', status === s ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
                >
                  {t.enums.leadStatus[s]}
                </button>
              ))}
            </div>

            <Select
              className="sm:hidden w-36 text-xs"
              aria-label={t.customers.status}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t.leads.all}</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.enums.leadStatus[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

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
        {list.data?.leads.length === 0 && (
          <Card className="p-0 border border-line shadow-sm">
            <div className="py-12 text-center">
              <Users className="mx-auto size-10 text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm text-slate-500">{t.leads.empty}</p>
            </div>
          </Card>
        )}
        {list.data && list.data.leads.length > 0 && viewMode === 'table' && (
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-medium sm:hidden">
              <span>{t.leads.scrollHint}</span>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className="font-semibold text-brand hover:underline"
              >
                {t.leads.cardView}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.leads.date}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.leads.customerInfo}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.leads.address} & {t.leads.area}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.leads.requestedPackage}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.leads.submittedBy}</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">{t.customers.status}</th>
                    <th className="px-4 py-3.5 text-right whitespace-nowrap">{t.leads.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {list.data.leads.map((lead) => {
                    const timeStr = new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-BD', {
                      timeZone: 'Asia/Dhaka',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    }).format(new Date(lead.createdAt));

                    return (
                      <tr
                        key={lead.id}
                        className="group transition-colors duration-150 hover:bg-slate-50/80"
                      >
                        {/* 1. Date & Time */}
                        <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 border border-slate-200/60 text-slate-700">
                              <Calendar className="size-4 text-slate-600" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900 leading-tight">
                                {formatDate(lead.createdAt, language)}
                              </div>
                              <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                {timeStr}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Customer Info */}
                        <td className="px-4 py-3.5 align-middle min-w-[200px]">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft border border-brand/20 text-brand font-bold text-xs">
                              {lead.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-sm leading-tight truncate">
                                {lead.fullName}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <a
                                  href={`tel:${lead.phone}`}
                                  className="inline-flex items-center gap-1 text-xs text-slate-700 font-mono font-medium bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition"
                                >
                                  <Phone className="size-3 text-slate-500" />
                                  <span>{lead.phone}</span>
                                </a>
                                {lead.note && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded max-w-[150px] truncate"
                                    title={lead.note}
                                  >
                                    <FileText className="size-3 text-amber-600 shrink-0" />
                                    <span className="truncate">{lead.note}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Area & Address */}
                        <td className="px-4 py-3.5 align-middle max-w-[240px]">
                          <div className="space-y-1">
                            {lead.area && (
                              <div className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100/80 px-2 py-0.5 rounded">
                                <MapPin className="size-3 text-indigo-500 shrink-0" />
                                <span className="truncate max-w-[160px]">{lead.area}</span>
                              </div>
                            )}
                            <div className="text-xs text-slate-600 leading-snug line-clamp-2" title={lead.address}>
                              {lead.address}
                            </div>
                          </div>
                        </td>

                        {/* 4. Requested Package */}
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap min-w-[150px]">
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-900 leading-tight">
                              {lead.requestedPackageName ?? t.leads.anyPackage}
                            </div>
                            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                              <Wifi className="size-3 text-slate-400" />
                              <span>{t.enums.connectionType[lead.connectionType]}</span>
                            </div>
                          </div>
                        </td>

                        {/* 5. Submitted By */}
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap min-w-[130px]">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
                            <User className="size-3 text-slate-400" />
                            <span>{lead.createdByName}</span>
                          </div>
                        </td>

                        {/* 6. Status */}
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap min-w-[130px]">
                          <div className="space-y-1">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border',
                                lead.status === 'PENDING' && 'bg-amber-50 text-amber-800 border-amber-200',
                                lead.status === 'APPROVED' && 'bg-emerald-50 text-emerald-800 border-emerald-200',
                                lead.status === 'REJECTED' && 'bg-rose-50 text-rose-800 border-rose-200'
                              )}
                            >
                              <span
                                className={cn(
                                  'size-1.5 rounded-full',
                                  lead.status === 'PENDING' && 'bg-amber-500 animate-pulse',
                                  lead.status === 'APPROVED' && 'bg-emerald-500',
                                  lead.status === 'REJECTED' && 'bg-rose-500'
                                )}
                              />
                              {t.enums.leadStatus[lead.status]}
                            </span>

                            {lead.rejectReason && (
                              <div
                                className="text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded max-w-[170px] truncate"
                                title={lead.rejectReason}
                              >
                                ⚠️ {lead.rejectReason}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 7. Actions */}
                        <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap min-w-[160px]">
                          {canReview && lead.status === 'PENDING' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 rounded-lg shadow-sm gap-1 transition"
                                onClick={() => {
                                  setRejecting(null);
                                  setApproving(lead);
                                }}
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                                {t.leads.approve}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 font-medium text-xs px-2.5 rounded-lg gap-1 transition"
                                onClick={() => {
                                  setApproving(null);
                                  setRejecting(lead);
                                }}
                              >
                                <X className="size-3.5" aria-hidden="true" />
                                {t.leads.reject}
                              </Button>
                            </div>
                          )}
                          {lead.customerId && (
                            <Link
                              to={`/customers/${lead.customerId}`}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-soft hover:bg-brand/15 text-brand text-xs font-semibold border border-brand/20 transition shadow-xs"
                            >
                              <span>{t.leads.openCustomer}</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {list.data && list.data.leads.length > 0 && viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.data.leads.map((lead) => {
              const timeStr = new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-BD', {
                timeZone: 'Asia/Dhaka',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              }).format(new Date(lead.createdAt));

              return (
                <Card
                  key={lead.id}
                  className="p-5 border border-slate-200/90 rounded-2xl bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft border border-brand/20 text-brand font-bold text-sm">
                          {lead.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base leading-tight">
                            {lead.fullName}
                          </h4>
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-700 font-mono font-medium hover:text-brand mt-1"
                          >
                            <Phone className="size-3 text-slate-400" />
                            {lead.phone}
                          </a>
                        </div>
                      </div>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border shrink-0',
                          lead.status === 'PENDING' && 'bg-amber-50 text-amber-800 border-amber-200',
                          lead.status === 'APPROVED' && 'bg-emerald-50 text-emerald-800 border-emerald-200',
                          lead.status === 'REJECTED' && 'bg-rose-50 text-rose-800 border-rose-200'
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            lead.status === 'PENDING' && 'bg-amber-500 animate-pulse',
                            lead.status === 'APPROVED' && 'bg-emerald-500',
                            lead.status === 'REJECTED' && 'bg-rose-500'
                          )}
                        />
                        {t.enums.leadStatus[lead.status]}
                      </span>
                    </div>

                    <div className="mt-3.5 space-y-2.5 text-xs">
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin className="size-3.5 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          {lead.area && (
                            <span className="font-semibold text-indigo-700 mr-1.5">
                              {lead.area} ·
                            </span>
                          )}
                          <span>{lead.address}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600">
                        <Wifi className="size-3.5 text-slate-400 shrink-0" />
                        <span>
                          <span className="font-bold text-slate-900">
                            {lead.requestedPackageName ?? t.leads.anyPackage}
                          </span>
                          {' · '}
                          <span className="font-medium text-slate-500">
                            {t.enums.connectionType[lead.connectionType]}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <User className="size-3.5 text-slate-400 shrink-0" />
                          <span>{lead.createdByName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Calendar className="size-3.5 text-slate-400 shrink-0" />
                          <span>{formatDate(lead.createdAt, language)} ({timeStr})</span>
                        </div>
                      </div>

                      {lead.note && (
                        <div className="rounded-lg bg-amber-50/80 border border-amber-200/70 p-2.5 text-amber-900 text-xs">
                          <span className="font-bold text-amber-950">মন্তব্য: </span>
                          {lead.note}
                        </div>
                      )}

                      {lead.rejectReason && (
                        <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700 text-xs">
                          <span className="font-bold">{t.leads.rejectReason}: </span>
                          {lead.rejectReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    {canReview && lead.status === 'PENDING' ? (
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          size="sm"
                          className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-semibold shadow-sm gap-1"
                          onClick={() => {
                            setRejecting(null);
                            setApproving(lead);
                          }}
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                          {t.leads.approve}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 gap-1"
                          onClick={() => {
                            setApproving(null);
                            setRejecting(lead);
                          }}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                          {t.leads.reject}
                        </Button>
                      </div>
                    ) : lead.customerId ? (
                      <Link
                        className="inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-lg bg-brand-soft hover:bg-brand/15 text-brand text-xs font-semibold border border-brand/20 transition shadow-xs"
                        to={`/customers/${lead.customerId}`}
                      >
                        <span>{t.leads.openCustomer}</span>
                        <ExternalLink className="size-3" />
                      </Link>
                    ) : (
                      <div />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <Pager pagination={list.data?.pagination} onPageChange={setPage} />
      </div>

      {/* 5. Approve Modal Dialog */}
      {approving && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity"
            onClick={() => setApproving(null)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <ApproveLeadForm
              lead={approving}
              onCancel={() => setApproving(null)}
              onSubmit={async (input) => {
                await approve.mutateAsync({ id: approving.id, input });
                setApproving(null);
                setNotice(t.leads.approved);
              }}
            />
          </div>
        </div>
      )}

      {/* 6. Reject Confirmation Modal */}
      {rejecting && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity"
            onClick={() => setRejecting(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="size-5" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">{t.leads.confirmReject}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <b>{rejecting.fullName}</b> ({rejecting.phone}){' '}
                  {language === 'bn'
                    ? 'এর নতুন সংযোগের আবেদনটি কি বাতিল করতে চান?'
                    : `'s new connection request will be cancelled.`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button
                variant="outline"
                onClick={() => setRejecting(null)}
                disabled={reject.isPending}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                onClick={() => void doReject()}
                disabled={reject.isPending}
              >
                {reject.isPending ? t.common.loading : t.leads.reject}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
