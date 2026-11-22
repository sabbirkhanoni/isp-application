import { zodResolver } from '@hookform/resolvers/zod';
import type { PackageDto } from '@isp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { createPackage, fetchPackages, packagesKey, updatePackage } from './packages-api';
import { Loading } from '@/components/ui/page';

/** The form works in whole taka; the API stores poisha. */
const formSchema = z.object({
  name: z.string().trim().min(2).max(60),
  speedMbps: z.coerce.number().int().min(1),
  priceTaka: z.coerce.number().min(0).max(1_000_000),
  pppProfile: z.string().trim().max(64).optional(),
});

export function PackagesPage() {
  const { t, language } = useI18n();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: packagesKey, queryFn: fetchPackages });
  const refresh = () => queryClient.invalidateQueries({ queryKey: packagesKey });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(formSchema) });

  const create = useMutation({ mutationFn: createPackage, onSuccess: refresh });
  const toggle = useMutation({
    mutationFn: (pkg: PackageDto) => updatePackage(pkg.id, { isActive: !pkg.isActive }),
    onSuccess: refresh,
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await create.mutateAsync({
        name: values.name,
        speedMbps: values.speedMbps,
        monthlyPricePoisha: Math.round(values.priceTaka * 100),
        ...(values.pppProfile ? { pppProfile: values.pppProfile } : {}),
      });
      reset();
      setShowForm(false);
      setNotice(t.packages.saved);
    } catch (e) {
      setError(toMessage(e));
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.packages.title}</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>{t.packages.add}</Button>}
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
        <Card>
          <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
            <Field
              label={t.packages.name}
              htmlFor="pkg-name"
              error={errors.name && t.errors.validation}
            >
              <Input id="pkg-name" {...register('name')} />
            </Field>
            <Field
              label={t.packages.speed}
              htmlFor="pkg-speed"
              error={errors.speedMbps && t.errors.validation}
            >
              <Input id="pkg-speed" type="number" inputMode="numeric" {...register('speedMbps')} />
            </Field>
            <Field
              label={t.packages.price}
              htmlFor="pkg-price"
              error={errors.priceTaka && t.errors.validation}
            >
              <Input
                id="pkg-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                {...register('priceTaka')}
              />
            </Field>
            <Field
              label={t.packages.pppProfile}
              htmlFor="pkg-profile"
              hint={t.packages.pppProfileHint}
            >
              <Input id="pkg-profile" {...register('pppProfile')} />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {t.common.save}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {list.isPending && <Loading />}
        {list.isError && <p className="p-5 text-red-700">{t.common.genericError}</p>}
        {list.data?.length === 0 && <p className="p-5 text-slate-500">{t.packages.empty}</p>}
        {list.data && list.data.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">{t.packages.name}</th>
                <th className="px-4 py-2">{t.packages.speed}</th>
                <th className="px-4 py-2">{t.packages.price}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((pkg) => (
                <tr key={pkg.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium">
                    {pkg.name} {!pkg.isActive && <Badge tone="warn">{t.packages.retired}</Badge>}
                  </td>
                  <td className="px-4 py-2">{pkg.speedMbps}</td>
                  <td className="px-4 py-2">{formatMoney(pkg.monthlyPricePoisha, language)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => toggle.mutate(pkg)}>
                      {pkg.isActive ? t.packages.retire : t.packages.restore}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
