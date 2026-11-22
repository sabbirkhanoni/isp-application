import { OLT_BRANDS, type OltBrand, type OltDto, type OltTestResultDto } from '@isp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Loading } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { createOlt, fetchOlts, oltKey, pollOlt, testOlt, updateOlt } from './olt-api';

const message = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Something went wrong';

interface FormState {
  name: string;
  brand: OltBrand;
  host: string;
  snmpPort: string;
  community: string;
  rxOid: string;
  idOid: string;
  divisor: string;
  isActive: boolean;
}

const blank: FormState = {
  name: '',
  brand: 'BDCOM',
  host: '',
  snmpPort: '161',
  community: '',
  rxOid: '',
  idOid: '',
  divisor: '',
  isActive: true,
};

const fromOlt = (o: OltDto): FormState => ({
  name: o.name,
  brand: o.brand,
  host: o.host,
  snmpPort: String(o.snmpPort),
  community: '',
  rxOid: o.rxOid ?? '',
  idOid: o.idOid ?? '',
  divisor: o.divisor ? String(o.divisor) : '',
  isActive: o.isActive,
});

function OltForm({
  olt,
  onDone,
  onCancel,
}: {
  olt?: OltDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(olt ? fromOlt(olt) : blank);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        brand: form.brand,
        host: form.host,
        snmpPort: Number(form.snmpPort) || 161,
        rxOid: form.rxOid,
        idOid: form.idOid,
        divisor: form.divisor,
        community: form.community,
      };
      return olt ? updateOlt(olt.id, { ...body, isActive: form.isActive }) : createOlt(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: oltKey });
      onDone();
    },
    onError: (e) => setError(message(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    save.mutate();
  };

  return (
    <Card>
      <form className="space-y-3" onSubmit={submit}>
        <h2 className="font-semibold">{olt ? t.olt.edit : t.olt.add}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t.olt.name}</span>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t.olt.brand}</span>
            <Select value={form.brand} onChange={(e) => set('brand', e.target.value as OltBrand)}>
              {OLT_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {t.olt.brands[b]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t.olt.host}</span>
            <Input
              value={form.host}
              placeholder="10.10.10.2"
              onChange={(e) => set('host', e.target.value)}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t.olt.port}</span>
            <Input
              inputMode="numeric"
              value={form.snmpPort}
              onChange={(e) => set('snmpPort', e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">{t.olt.community}</span>
            <Input
              type="password"
              autoComplete="off"
              value={form.community}
              placeholder={olt ? t.olt.keepCommunity : 'public'}
              onChange={(e) => set('community', e.target.value)}
              required={!olt}
            />
            <span className="block text-xs text-slate-500">{t.olt.communityHint}</span>
          </label>
        </div>

        <details className="rounded-lg bg-slate-50 p-3 text-sm" open={form.brand === 'CDATA'}>
          <summary className="cursor-pointer font-medium">{t.olt.advanced}</summary>
          <p className="mt-2 text-xs text-slate-500">
            {form.brand === 'CDATA' ? t.olt.cdataHint : t.olt.advancedHint}
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">{t.olt.rxOid}</span>
              <Input
                className="font-mono"
                value={form.rxOid}
                onChange={(e) => set('rxOid', e.target.value)}
                required={form.brand === 'CDATA'}
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">{t.olt.idOid}</span>
              <Input
                className="font-mono"
                value={form.idOid}
                onChange={(e) => set('idOid', e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">{t.olt.divisor}</span>
              <Input
                inputMode="numeric"
                value={form.divisor}
                onChange={(e) => set('divisor', e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </div>
        </details>

        {olt && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
            {t.olt.active}
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {t.common.save}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function OltCard({ olt, onEdit }: { olt: OltDto; onEdit: () => void }) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<OltTestResultDto | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: () => testOlt(olt.id),
    onSuccess: (data) => {
      setNote(null);
      setResult(data);
    },
    onError: (e) => setNote(message(e)),
  });
  const poll = useMutation({
    mutationFn: () => pollOlt(olt.id),
    onSuccess: async (data) => {
      setResult(null);
      setNote(t.olt.polled.replace('{count}', String(data.stored)));
      await queryClient.invalidateQueries({ queryKey: oltKey });
    },
    onError: async (e) => {
      setNote(message(e));
      await queryClient.invalidateQueries({ queryKey: oltKey });
    },
  });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{olt.name}</h2>
            {!olt.isActive && <Badge>{t.olt.paused}</Badge>}
            {olt.criticalCount > 0 && (
              <Badge tone="bad">
                {olt.criticalCount} {t.fiberSignal.critical}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {t.olt.brands[olt.brand]} · {olt.host}:{olt.snmpPort} · {olt.onuCount} ONU
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? t.olt.testing : t.olt.test}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={poll.isPending}
            onClick={() => poll.mutate()}
          >
            {poll.isPending ? t.olt.reading : t.olt.readNow}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            {t.olt.edit}
          </Button>
        </div>
      </div>

      {olt.lastError ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{olt.lastError}</p>
      ) : olt.lastPolledAt ? (
        <p className="text-xs text-slate-500">
          {t.olt.lastRead}: {formatDateTime(olt.lastPolledAt, language)}
        </p>
      ) : (
        <p className="text-xs text-slate-500">{t.olt.neverRead}</p>
      )}

      {note && <p className="text-sm text-slate-700">{note}</p>}
      {result && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className={result.ok ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
            {result.message}
          </p>
          {result.samples.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">{t.olt.sampleOnu}</th>
                  <th>{t.olt.sampleRaw}</th>
                  <th>dBm</th>
                </tr>
              </thead>
              <tbody>
                {result.samples.map((s) => (
                  <tr key={s.onuIndex} className="border-t border-line">
                    <td className="py-1 font-mono">{s.onuKey}</td>
                    <td className="font-mono">{s.raw}</td>
                    <td>{s.rxDbm === null ? '–' : s.rxDbm.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

export function OltsPage() {
  const { t } = useI18n();
  const olts = useQuery({ queryKey: oltKey, queryFn: fetchOlts });
  const [editing, setEditing] = useState<OltDto | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.olt.title}</h1>
          <p className="text-sm text-slate-600">{t.olt.intro}</p>
        </div>
        {editing === null && <Button onClick={() => setEditing('new')}>{t.olt.add}</Button>}
      </div>

      {editing !== null && (
        <OltForm
          key={editing === 'new' ? 'new' : editing.id}
          olt={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}

      {olts.isLoading ? (
        <Loading />
      ) : olts.data && olts.data.length === 0 && editing === null ? (
        <EmptyState
          icon={Server}
          title={t.olt.empty}
          hint={t.olt.emptyHint}
          action={<Button onClick={() => setEditing('new')}>{t.olt.add}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {olts.data?.map((o) => (
            <OltCard key={o.id} olt={o} onEdit={() => setEditing(o)} />
          ))}
        </div>
      )}
    </div>
  );
}
