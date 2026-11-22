import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/i18n/i18n-context';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { UsageCard } from '@/features/network/usage-card';
import { CustomerBillingSection } from '@/features/billing/customer-billing-section';
import { CustomerStatusBadge } from './customer-status-badge';
import {
  fetchCustomerLine,
  fetchPppoePassword,
  fetchRouters,
  linesKey,
  routersKey,
} from '@/features/network/network-api';
import { fetchPackages, packagesKey } from '@/features/packages/packages-api';
import { formatSince, isStale, LineBadge } from '@/features/network/line-badge';
import { FiberBadge } from '@/features/olt/fiber-badge';
import { fetchCustomerFiber } from '@/features/olt/olt-api';
import { LiveLinePanel } from '@/features/network/live-line-panel';
import { Select } from '@/components/ui/select';
import {
  activateCustomer,
  terminateCustomer,
  customersKey,
  fetchCustomer,
  suspendCustomer,
  updateCustomer,
} from './customers-api';
import { Loading } from '@/components/ui/page';

const editSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?88)?01[3-9]\d{8}$/),
  altPhone: z
    .string()
    .trim()
    .regex(/^((\+?88)?01[3-9]\d{8})?$/),
  address: z.string().trim().min(3).max(300),
  area: z.string().trim().max(80),
});

const normalizePhone = (value: string) => value.replace(/^\+?88/, '');

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t, language } = useI18n();
  const { can } = useAuth();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const query = useQuery({ queryKey: [...customersKey, id], queryFn: () => fetchCustomer(id) });
  const save = useMutation({
    mutationFn: (values: z.infer<typeof editSchema>) =>
      updateCustomer(id, {
        fullName: values.fullName,
        phone: normalizePhone(values.phone),
        altPhone: values.altPhone ? normalizePhone(values.altPhone) : null,
        address: values.address,
        area: values.area || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });

  const line = useQuery({
    queryKey: [...linesKey, 'customer', id],
    queryFn: () => fetchCustomerLine(id),
    refetchInterval: 30_000,
  });

  const fiberSignal = useQuery({
    queryKey: ['fiber', 'customer', id],
    queryFn: () => fetchCustomerFiber(id),
    refetchInterval: 60_000,
  });

  const routers = useQuery({
    queryKey: routersKey,
    queryFn: fetchRouters,
    enabled: can('ROUTER_CONFIG_WRITE'),
  });
  const changeRouter = useMutation({
    mutationFn: (routerId: string | null) => updateCustomer(id, { routerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });
  const packages = useQuery({
    queryKey: packagesKey,
    queryFn: fetchPackages,
    enabled: can('CUSTOMER_UPDATE'),
  });
  const changePackage = useMutation({
    mutationFn: (packageId: string) => updateCustomer(id, { packageId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });
  const onPackageChange = async (value: string) => {
    if (!value || !window.confirm(t.customers.confirmPlanChange)) return;
    try {
      await changePackage.mutateAsync(value);
      setMessage({ ok: true, text: t.customers.planChanged });
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };
  const setOptOut = useMutation({
    mutationFn: (smsOptOut: boolean) => updateCustomer(id, { smsOptOut }),
    onSuccess: (_res, smsOptOut) => {
      setMessage({ ok: true, text: smsOptOut ? t.admin.optOutOn : t.admin.optOutOff });
      return queryClient.invalidateQueries({ queryKey: customersKey });
    },
    onError: (e) => setMessage({ ok: false, text: toMessage(e) }),
  });
  const setFree = useMutation({
    mutationFn: (isFree: boolean) => updateCustomer(id, { isFree }),
    onSuccess: (_res, isFree) => {
      setMessage({ ok: true, text: isFree ? t.free.on : t.free.off });
      return queryClient.invalidateQueries({ queryKey: customersKey });
    },
    onError: (e) => setMessage({ ok: false, text: toMessage(e) }),
  });
  const [fiberEditing, setFiberEditing] = useState(false);
  const [fiber, setFiber] = useState({ oltName: '', ponPort: '', onuSerial: '' });
  const saveFiber = useMutation({
    mutationFn: () =>
      updateCustomer(id, {
        oltName: fiber.oltName.trim() || null,
        ponPort: fiber.ponPort.trim() || null,
        onuSerial: fiber.onuSerial.trim() || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });
  const [shownPassword, setShownPassword] = useState<string | null | undefined>(undefined);
  const showPassword = async () => {
    try {
      setShownPassword((await fetchPppoePassword(id)).password);
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };
  const changeStatus = useMutation({
    mutationFn: ({
      action,
      prorate,
    }: {
      action: 'NON_PAYMENT' | 'MANUAL' | 'ACTIVATE' | 'TERMINATE';
      prorate: boolean;
    }) =>
      action === 'ACTIVATE'
        ? activateCustomer(id)
        : action === 'TERMINATE'
          ? terminateCustomer(id, prorate)
          : suspendCustomer(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });
  const runStatus = async (action: 'NON_PAYMENT' | 'MANUAL' | 'ACTIVATE' | 'TERMINATE') => {
    const question =
      action === 'TERMINATE' ? t.customers.confirmTerminate : t.customers.confirmSuspend;
    if (action !== 'ACTIVATE' && !window.confirm(question)) return;
    try {
      const prorate =
        action === 'TERMINATE' && can('BILLING_ADJUST') && window.confirm(t.extras.proratePrompt);
      await changeStatus.mutateAsync({ action, prorate });
      setMessage({
        ok: true,
        text:
          action === 'ACTIVATE'
            ? t.customers.activatedOk
            : action === 'TERMINATE'
              ? t.customers.terminated
              : t.customers.suspendedOk,
      });
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };
  const onRouterChange = async (value: string) => {
    try {
      await changeRouter.mutateAsync(value || null);
      setMessage({ ok: true, text: t.customers.updated });
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  };

  const customer = query.data;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editSchema),
    values: customer && {
      fullName: customer.fullName,
      phone: customer.phone,
      altPhone: customer.altPhone ?? '',
      address: customer.address,
      area: customer.area ?? '',
    },
  });

  if (query.isPending) return <Loading />;
  if (query.isError || !customer) return <p className="text-red-700">{t.common.genericError}</p>;

  const submit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      setEditing(false);
      setMessage({ ok: true, text: t.customers.updated });
    } catch (e) {
      setMessage({ ok: false, text: toMessage(e) });
    }
  });
  const sub = customer.subscription;
  const invalid = t.errors.validation;

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/customers" className="text-sm text-brand hover:underline">
        ← {t.customers.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{customer.fullName}</h1>
        <span className="font-mono text-sm text-slate-500">{customer.customerCode}</span>
        <CustomerStatusBadge status={customer.status} />
        {customer.isFree && <Badge tone="good">{t.free.badge}</Badge>}
        {fiberSignal.data && (
          <FiberBadge rxDbm={fiberSignal.data.rxDbm} level={fiberSignal.data.level} />
        )}
      </div>
      {line.data && (
        <Card className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{t.lines.line}</h2>
            <LineBadge state={line.data.state} />
            {isStale(line.data) && (
              <span className="text-xs text-amber-700">{t.lines.staleHint}</span>
            )}
          </div>
          <div className="text-sm text-slate-600">
            {line.data.state === 'ONLINE' ? (
              <>
                {t.lines.ip}: {line.data.address ?? '–'}
                {line.data.onlineSince &&
                  ` · ${t.lines.onlineFor}: ${formatSince(line.data.onlineSince, language)}`}
              </>
            ) : (
              <>
                {t.lines.lastOnline}:{' '}
                {line.data.lastOnlineAt
                  ? formatDateTime(line.data.lastOnlineAt, language)
                  : t.routers.never}
              </>
            )}
          </div>
          <LiveLinePanel customerId={id} online={line.data.state === 'ONLINE'} />
        </Card>
      )}
      {customer.status === 'SUSPENDED' && customer.suspendReason && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {customer.suspendReason === 'NON_PAYMENT'
            ? t.customers.reasonNonPayment
            : t.customers.reasonManual}
        </p>
      )}
      {can('CUSTOMER_SUSPEND') && (
        <div className="flex flex-wrap gap-2">
          {customer.status === 'ACTIVE' && (
            <>
              <Button variant="danger" size="sm" onClick={() => void runStatus('NON_PAYMENT')}>
                {t.customers.suspendNonPayment}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void runStatus('MANUAL')}>
                {t.customers.suspendManual}
              </Button>
            </>
          )}
          {customer.status !== 'ACTIVE' && (
            <Button size="sm" onClick={() => void runStatus('ACTIVATE')}>
              {customer.status === 'TERMINATED'
                ? t.customers.reconnectFormer
                : t.customers.activate}
            </Button>
          )}
          {customer.status !== 'TERMINATED' && (
            <Button variant="outline" size="sm" onClick={() => void runStatus('TERMINATE')}>
              {t.customers.terminate}
            </Button>
          )}
        </div>
      )}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={
            message.ok
              ? 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800'
              : 'rounded-lg bg-red-50 p-3 text-sm text-red-700'
          }
        >
          {message.text}
        </p>
      )}

      {can('INVOICE_READ') && <CustomerBillingSection customerId={customer.id} />}
      {can('CUSTOMER_READ') && <UsageCard customerId={customer.id} />}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{t.customers.contact}</h2>
          {can('CUSTOMER_UPDATE') && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t.customers.edit}
            </Button>
          )}
        </div>
        {editing ? (
          <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
            <Field label={t.leads.fullName} htmlFor="e-name" error={errors.fullName && invalid}>
              <Input id="e-name" {...register('fullName')} />
            </Field>
            <Field label={t.leads.phone} htmlFor="e-phone" error={errors.phone && invalid}>
              <Input id="e-phone" inputMode="tel" {...register('phone')} />
            </Field>
            <Field label={t.customers.altPhone} htmlFor="e-alt" error={errors.altPhone && invalid}>
              <Input id="e-alt" inputMode="tel" {...register('altPhone')} />
            </Field>
            <Field label={t.leads.area} htmlFor="e-area">
              <Input id="e-area" {...register('area')} />
            </Field>
            <div className="md:col-span-2">
              <Field label={t.leads.address} htmlFor="e-address" error={errors.address && invalid}>
                <Input id="e-address" {...register('address')} />
              </Field>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {t.common.save}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{t.leads.phone}</dt>
              <dd>{customer.phone}</dd>
            </div>
            {customer.altPhone && (
              <div>
                <dt className="text-slate-500">{t.customers.altPhone}</dt>
                <dd>{customer.altPhone}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">{t.leads.area}</dt>
              <dd>{customer.area ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">{t.leads.address}</dt>
              <dd>{customer.address}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">{t.customers.subscription}</h2>
        {sub ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{t.customers.package}</dt>
              <dd>
                {sub.packageName} — {formatMoney(sub.monthlyPricePoisha, language)}
                {can('CUSTOMER_UPDATE') && packages.data && (
                  <Select
                    className="mt-1"
                    aria-label={t.customers.changePackage}
                    value=""
                    onChange={(e) => void onPackageChange(e.target.value)}
                  >
                    <option value="">{t.customers.changePackage}</option>
                    {packages.data
                      .filter((p) => p.isActive && p.id !== sub.packageId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatMoney(p.monthlyPricePoisha, language)}
                        </option>
                      ))}
                  </Select>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.customers.connection}</dt>
              <dd>{t.enums.connectionType[sub.connectionType]}</dd>
            </div>
            {sub.pppoeUsername && (
              <div>
                <dt className="text-slate-500">{t.activation.pppoeUsername}</dt>
                <dd className="font-mono">{sub.pppoeUsername}</dd>
              </div>
            )}
            {sub.connectionType === 'PPPOE' && (
              <div>
                <dt className="text-slate-500">{t.customers.router}</dt>
                <dd>
                  {can('ROUTER_CONFIG_WRITE') && routers.data ? (
                    <Select
                      aria-label={t.customers.changeRouter}
                      value={sub.routerId ?? ''}
                      onChange={(e) => void onRouterChange(e.target.value)}
                    >
                      <option value="">{t.activation.noRouter}</option>
                      {routers.data
                        .filter((r) => r.isActive || r.id === sub.routerId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </Select>
                  ) : (
                    (sub.routerName ?? t.activation.noRouter)
                  )}
                </dd>
              </div>
            )}
            {sub.connectionType === 'PPPOE' && sub.routerId && can('ROUTER_CONFIG_WRITE') && (
              <div>
                <dt className="text-slate-500">{t.activation.pppoePassword}</dt>
                <dd>
                  {shownPassword === undefined && sub.hasPppoePassword ? (
                    <Button size="sm" variant="outline" onClick={() => void showPassword()}>
                      {t.customers.showPassword}
                    </Button>
                  ) : shownPassword ? (
                    <code className="font-mono">{shownPassword}</code>
                  ) : (
                    <span className="text-slate-500">{t.customers.passwordUnknown}</span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">{t.activation.policy}</dt>
              <dd>{t.enums.activationPolicy[sub.activationPolicy]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.common.created}</dt>
              <dd>{formatDate(customer.createdAt, language)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{t.customers.noSubscription}</p>
        )}
      </Card>

      {can('SYSTEM_SETTINGS_WRITE') && (
        <Card>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={customer.isFree}
              disabled={setFree.isPending}
              onChange={(e) => setFree.mutate(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t.free.label}</span>
              <span className="block text-xs text-slate-500">{t.free.hint}</span>
            </span>
          </label>
        </Card>
      )}

      {can('CUSTOMER_UPDATE') && (
        <Card>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={customer.smsOptOut}
              disabled={setOptOut.isPending}
              onChange={(e) => setOptOut.mutate(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t.admin.optOutLabel}</span>
              <span className="block text-xs text-slate-500">{t.admin.optOutHint}</span>
            </span>
          </label>
        </Card>
      )}

      {sub && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">{t.fiber.title}</h2>
            {can('CUSTOMER_UPDATE') && !fiberEditing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFiber({
                    oltName: sub.oltName ?? '',
                    ponPort: sub.ponPort ?? '',
                    onuSerial: sub.onuSerial ?? '',
                  });
                  setFiberEditing(true);
                }}
              >
                {t.customers.edit}
              </Button>
            )}
          </div>
          {fiberEditing ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.fiber.oltName} htmlFor="f-olt">
                <Input
                  id="f-olt"
                  value={fiber.oltName}
                  onChange={(e) => setFiber({ ...fiber, oltName: e.target.value })}
                />
              </Field>
              <Field label={t.fiber.ponPort} htmlFor="f-pon">
                <Input
                  id="f-pon"
                  value={fiber.ponPort}
                  onChange={(e) => setFiber({ ...fiber, ponPort: e.target.value })}
                />
              </Field>
              <Field label={t.fiber.onuSerial} htmlFor="f-onu">
                <Input
                  id="f-onu"
                  value={fiber.onuSerial}
                  onChange={(e) => setFiber({ ...fiber, onuSerial: e.target.value })}
                />
              </Field>
              <div className="flex gap-2 sm:col-span-3">
                <Button
                  disabled={saveFiber.isPending}
                  onClick={() =>
                    void saveFiber
                      .mutateAsync()
                      .then(() => {
                        setFiberEditing(false);
                        setMessage({ ok: true, text: t.customers.updated });
                      })
                      .catch((e: unknown) => setMessage({ ok: false, text: toMessage(e) }))
                  }
                >
                  {t.common.save}
                </Button>
                <Button variant="outline" onClick={() => setFiberEditing(false)}>
                  {t.common.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">{t.fiber.oltName}</dt>
                <dd>{sub.oltName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t.fiber.ponPort}</dt>
                <dd>{sub.ponPort ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t.fiber.onuSerial}</dt>
                <dd className="font-mono">{sub.onuSerial ?? '—'}</dd>
              </div>
            </dl>
          )}
        </Card>
      )}
    </div>
  );
}
