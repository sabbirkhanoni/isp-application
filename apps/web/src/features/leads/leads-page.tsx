import { LEAD_STATUSES, type LeadDto } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  UserPlus,
  Users,
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
import { formatDateTime } from '@/lib/format';
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

        <Card className="overflow-x-auto p-0 border border-line shadow-sm">
          {list.isPending && <Loading />}
          {list.isError && <p className="p-6 text-red-700">{t.common.genericError}</p>}
          {list.data?.leads.length === 0 && (
            <div className="py-12 text-center">
              <Users className="mx-auto size-10 text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm text-slate-500">{t.leads.empty}</p>
            </div>
          )}
          {list.data && list.data.leads.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">{t.leads.date}</th>
                  <th className="px-4 py-3">{t.leads.customerInfo}</th>
                  <th className="hidden px-4 py-3 sm:table-cell">{t.leads.address} & {t.leads.area}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t.leads.requestedPackage}</th>
                  <th className="hidden px-4 py-3 lg:table-cell">{t.leads.submittedBy}</th>
                  <th className="px-4 py-3">{t.customers.status}</th>
                  <th className="px-4 py-3 text-right">{t.leads.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.leads.map((lead) => (
                  <tr key={lead.id} className="transition hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap align-top">
                      {formatDateTime(lead.createdAt, language)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">{lead.fullName}</div>
                      <a href={`tel:${lead.phone}`} className="text-xs text-slate-600 font-mono hover:text-brand">
                        {lead.phone}
                      </a>
                      {lead.note && (
                        <div className="mt-1 text-xs text-slate-500 italic max-w-xs">
                          {lead.note}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-600 sm:table-cell align-top">
                      {lead.area && <span className="font-medium text-slate-800">{lead.area} · </span>}
                      <span>{lead.address}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs md:table-cell align-top">
                      <div className="font-medium text-slate-900">
                        {lead.requestedPackageName ?? t.leads.anyPackage}
                      </div>
                      <div className="text-slate-500">
                        {t.enums.connectionType[lead.connectionType]}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-600 lg:table-cell align-top">
                      {lead.createdByName}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={TONES[lead.status]}>{t.enums.leadStatus[lead.status]}</Badge>
                      {lead.rejectReason && (
                        <p className="mt-1 text-xs text-red-600 max-w-xs">{lead.rejectReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                      {canReview && lead.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            className="h-8 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700 font-medium"
                            onClick={() => {
                              setRejecting(null);
                              setApproving(lead);
                            }}
                          >
                            <Check className="mr-1 size-3.5" aria-hidden="true" />
                            {t.leads.approve}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-red-200 px-2.5 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              setApproving(null);
                              setRejecting(lead);
                            }}
                          >
                            <X className="mr-1 size-3.5" aria-hidden="true" />
                            {t.leads.reject}
                          </Button>
                        </div>
                      )}
                      {lead.customerId && (
                        <Link
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                          to={`/customers/${lead.customerId}`}
                        >
                          {t.leads.openCustomer} →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
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
