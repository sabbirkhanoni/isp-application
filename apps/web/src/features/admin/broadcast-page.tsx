import { useMutation } from '@tanstack/react-query';
import type { BroadcastInput, BroadcastPreviewDto } from '@isp/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { previewBroadcast, sendBroadcast } from './automation-api';

type Status = 'ACTIVE' | 'SUSPENDED' | 'ALL';

export function BroadcastPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [area, setArea] = useState('');
  const [onlyWithDues, setOnlyWithDues] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<BroadcastPreviewDto | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const input = (): BroadcastInput => ({
    audience: { status, onlyWithDues, ...(area ? { area } : {}) },
    message,
  });
  const check = useMutation({
    mutationFn: () => previewBroadcast(input()),
    onSuccess: (value) => {
      setPreview(value);
      setAreas(value.areas);
      setNote(null);
    },
    onError: (e) => setNote({ ok: false, text: toMessage(e) }),
  });
  const send = useMutation({
    mutationFn: () => sendBroadcast(input()),
    onSuccess: (value) => {
      setPreview(null);
      setMessage('');
      setNote({ ok: true, text: t.automation.queued.replace('{n}', String(value.queued)) });
    },
    onError: (e) => setNote({ ok: false, text: toMessage(e) }),
  });
  const reset = () => setPreview(null);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.automation.bulkTitle}</h1>
        <p className="text-sm text-slate-600">{t.automation.bulkIntro}</p>
      </div>
      <Card className="space-y-3">
        <Field label={t.automation.who} htmlFor="b-status">
          <Select
            id="b-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              reset();
            }}
          >
            <option value="ACTIVE">{t.automation.whoActive}</option>
            <option value="SUSPENDED">{t.automation.whoSuspended}</option>
            <option value="ALL">{t.automation.whoAll}</option>
          </Select>
        </Field>
        <Field label={t.automation.area} htmlFor="b-area" hint={t.automation.areaHint}>
          <input
            id="b-area"
            list="b-areas"
            className="h-10 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              reset();
            }}
          />
          <datalist id="b-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyWithDues}
            onChange={(e) => {
              setOnlyWithDues(e.target.checked);
              reset();
            }}
          />
          {t.automation.onlyDues}
        </label>
        <Field
          label={t.automation.messageLabel}
          htmlFor="b-message"
          hint={t.automation.messageHint}
        >
          <textarea
            id="b-message"
            rows={4}
            maxLength={300}
            className="w-full rounded-lg border border-slate-300 bg-surface p-3 text-sm"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              reset();
            }}
          />
        </Field>
        <p className="text-xs text-slate-500">{message.length}/300</p>
        <Button
          variant="outline"
          disabled={message.trim().length < 5 || check.isPending}
          onClick={() => check.mutate()}
        >
          {t.automation.check}
        </Button>
      </Card>
      {preview && (
        <Card className="space-y-2">
          <p className="text-sm font-medium">
            {t.automation.willSend.replace('{n}', String(preview.recipients))}
          </p>
          {preview.optedOut > 0 && (
            <p className="text-xs text-slate-500">
              {t.automation.skippedOptOut.replace('{n}', String(preview.optedOut))}
            </p>
          )}
          <p className="rounded bg-slate-100 p-2 text-sm">{preview.sample}</p>
          <p className="text-xs text-slate-500">{t.automation.sendWindowNote}</p>
          {preview.tooMany && <p className="text-sm text-red-700">{t.automation.tooMany}</p>}
          <Button
            disabled={preview.recipients === 0 || preview.tooMany || send.isPending}
            onClick={() => send.mutate()}
          >
            {t.automation.sendNow}
          </Button>
        </Card>
      )}
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
