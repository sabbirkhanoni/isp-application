import { ROUTER_DRIVERS, type CreateRouterInput, type RouterDto } from '@isp/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/i18n/i18n-context';
import { useErrorMessage } from '@/lib/use-error-message';

interface RouterFormProps {
  /** Present when editing; the driver cannot be changed afterwards. */
  router?: RouterDto;
  onSubmit(input: CreateRouterInput): Promise<void>;
  onCancel(): void;
}

export function RouterForm({ router, onSubmit, onCancel }: RouterFormProps) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [values, setValues] = useState({
    name: router?.name ?? '',
    driver: router?.driver ?? ('REST' as const),
    host: router?.host ?? '',
    port: String(router?.port ?? 443),
    useTls: router?.useTls ?? true,
    allowSelfSigned: router?.allowSelfSigned ?? true,
    username: router?.username ?? '',
    password: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const direct = values.driver === 'REST';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await onSubmit({
        name: values.name,
        driver: values.driver,
        host: direct ? values.host : undefined,
        port: Number(values.port) || 443,
        useTls: values.useTls,
        allowSelfSigned: values.allowSelfSigned,
        username: direct ? values.username : undefined,
        password: direct && values.password ? values.password : undefined,
      });
    } catch (e) {
      setMessage(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 md:grid-cols-2">
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
            {message}
          </p>
        )}
        <Field label={t.routers.name} htmlFor="r-name">
          <Input
            id="r-name"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label={t.routers.driver} htmlFor="r-driver" hint={t.routers.driverHint}>
          <Select
            id="r-driver"
            value={values.driver}
            disabled={router !== undefined}
            onChange={(e) => set('driver', e.target.value as typeof values.driver)}
          >
            {ROUTER_DRIVERS.map((driver) => (
              <option key={driver} value={driver}>
                {t.routers[`driver${driver}`]}
              </option>
            ))}
          </Select>
        </Field>
        {direct && (
          <>
            <Field label={t.routers.host} htmlFor="r-host">
              <Input
                id="r-host"
                autoCapitalize="none"
                value={values.host}
                onChange={(e) => set('host', e.target.value)}
              />
            </Field>
            <Field label={t.routers.port} htmlFor="r-port">
              <Input
                id="r-port"
                inputMode="numeric"
                value={values.port}
                onChange={(e) => set('port', e.target.value)}
              />
            </Field>
            <Field label={t.routers.username} htmlFor="r-user">
              <Input
                id="r-user"
                autoComplete="off"
                autoCapitalize="none"
                value={values.username}
                onChange={(e) => set('username', e.target.value)}
              />
            </Field>
            <Field
              label={t.routers.password}
              htmlFor="r-pass"
              hint={router?.hasPassword ? t.routers.passwordKeep : undefined}
            >
              <Input
                id="r-pass"
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => set('password', e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.useTls}
                onChange={(e) => set('useTls', e.target.checked)}
              />
              {t.routers.useTls}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.allowSelfSigned}
                onChange={(e) => set('allowSelfSigned', e.target.checked)}
              />
              {t.routers.allowSelfSigned}
            </label>
          </>
        )}
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={busy}>
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
