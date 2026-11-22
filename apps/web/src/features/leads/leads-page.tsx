import { LEAD_STATUSES, type LeadDto } from '@isp/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
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
  const [status, setStatus] = useState('PENDING');
  const [showForm, setShowForm] = useState(false);
  const [approving, setApproving] = useState<LeadDto | null>(null);
  const [rejecting, setRejecting] = useState<LeadDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...leadsKey, { page, status }],
    queryFn: () => fetchLeads(page, status),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: leadsKey });
  const create = useMutation({ mutationFn: createLead, onSuccess: refresh });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.leads.title}</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>{t.leads.add}</Button>}
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {showForm && (
        <LeadForm
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setShowForm(false);
            setNotice(t.leads.created);
          }}
        />
      )}

      {approving && (
        <ApproveLeadForm
          lead={approving}
          onCancel={() => setApproving(null)}
          onSubmit={async (input) => {
            await approve.mutateAsync({ id: approving.id, input });
            setApproving(null);
            setNotice(t.leads.approved);
          }}
        />
      )}

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

      <Select
        className="sm:w-56"
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

      {list.isPending && <Loading />}
      {list.isError && <p className="text-red-700">{t.common.genericError}</p>}
      {list.data?.leads.length === 0 && <p className="text-slate-500">{t.leads.empty}</p>}
      <div className="space-y-3">
        {list.data?.leads.map((lead) => (
          <Card key={lead.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{lead.fullName}</div>
              <Badge tone={TONES[lead.status]}>{t.enums.leadStatus[lead.status]}</Badge>
            </div>
            <div className="text-sm text-slate-600">
              {lead.phone} · {lead.area ? `${lead.area} · ` : ''}
              {lead.address}
            </div>
            <div className="text-xs text-slate-500">
              {lead.requestedPackageName ?? t.leads.anyPackage} ·{' '}
              {t.enums.connectionType[lead.connectionType]} · {t.leads.submittedBy}:{' '}
              {lead.createdByName} · {formatDateTime(lead.createdAt, language)}
            </div>
            {lead.note && <div className="text-sm">{lead.note}</div>}
            {lead.rejectReason && <div className="text-sm text-red-700">{lead.rejectReason}</div>}
            {lead.customerId && (
              <Link
                className="text-sm text-brand hover:underline"
                to={`/customers/${lead.customerId}`}
              >
                {t.leads.openCustomer}
              </Link>
            )}
            {canReview && lead.status === 'PENDING' && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setRejecting(null);
                    setApproving(lead);
                  }}
                >
                  {t.leads.approve}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setApproving(null);
                    setRejecting(lead);
                  }}
                >
                  {t.leads.reject}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Pager pagination={list.data?.pagination} onPageChange={setPage} />
    </div>
  );
}
