import { ACTIVATION_POLICIES, CONNECTION_TYPES, type ApproveLeadInput } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useFormContext } from 'react-hook-form';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fetchRouters, routersKey } from '@/features/network/network-api';
import { fetchPackages, packagesKey } from '@/features/packages/packages-api';
import { useI18n } from '@/i18n/i18n-context';
import { formatMoney } from '@/lib/format';

type ActivationFormValues = Pick<
  ApproveLeadInput,
  | 'packageId'
  | 'connectionType'
  | 'pppoeUsername'
  | 'activationPolicy'
  | 'customerCode'
  | 'routerId'
  | 'pppoePassword'
>;

interface ActivationFieldsProps {
  compactHints?: boolean;
}

/**
 * The connection + Internet Activation Policy section.
 * Used both when approving a lead and when the admin creates a customer directly (BR-09).
 */
export function ActivationFields({ compactHints = false }: ActivationFieldsProps = {}) {
  const { t, language } = useI18n();
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<ActivationFormValues>();
  const packages = useQuery({ queryKey: packagesKey, queryFn: fetchPackages });
  const routers = useQuery({ queryKey: routersKey, queryFn: fetchRouters });
  const connectionType = watch('connectionType');
  const invalid = t.errors.validation;

  return (
    <>
      <Field label={t.activation.package} htmlFor="act-package" error={errors.packageId && invalid}>
        <Select id="act-package" {...register('packageId')}>
          <option value="">{t.activation.choosePackage}</option>
          {packages.data
            ?.filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.monthlyPricePoisha, language)}
              </option>
            ))}
        </Select>
      </Field>
      <Field label={t.activation.connectionType} htmlFor="act-type">
        <Select id="act-type" {...register('connectionType')}>
          {CONNECTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.enums.connectionType[type]}
            </option>
          ))}
        </Select>
      </Field>
      {connectionType === 'PPPOE' && (
        <Field
          label={t.activation.pppoeUsername}
          htmlFor="act-pppoe"
          error={errors.pppoeUsername && invalid}
        >
          <Input
            id="act-pppoe"
            placeholder={compactHints ? t.customers.pppoeUserPlaceholder : undefined}
            autoCapitalize="none"
            autoComplete="off"
            {...register('pppoeUsername')}
          />
        </Field>
      )}
      {connectionType === 'PPPOE' && (
        <Field
          label={t.activation.pppoePassword}
          htmlFor="act-pppoe-pw"
          hint={compactHints ? undefined : t.activation.pppoePasswordHint}
          error={errors.pppoePassword && invalid}
        >
          <Input
            id="act-pppoe-pw"
            placeholder={compactHints ? t.customers.pppoePassPlaceholder : undefined}
            autoCapitalize="none"
            autoComplete="off"
            {...register('pppoePassword')}
          />
        </Field>
      )}
      {connectionType === 'PPPOE' && (
        <Field label={t.activation.router} htmlFor="act-router">
          <Select id="act-router" {...register('routerId')}>
            <option value="">{t.activation.noRouter}</option>
            {routers.data
              ?.filter((r) => r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field
        label={t.activation.policy}
        htmlFor="act-policy"
        hint={compactHints ? undefined : t.activation.policyHint}
      >
        <Select id="act-policy" {...register('activationPolicy')}>
          {ACTIVATION_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {t.enums.activationPolicy[policy]}
            </option>
          ))}
        </Select>
      </Field>
      <div className={compactHints ? 'sm:col-span-2' : undefined}>
        <Field
          label={t.activation.customerCode}
          htmlFor="act-code"
          hint={compactHints ? undefined : t.activation.customerCodeHint}
          error={errors.customerCode && invalid}
        >
          <Input
            id="act-code"
            placeholder={compactHints ? t.customers.customerCodePlaceholder : undefined}
            autoCapitalize="none"
            autoComplete="off"
            {...register('customerCode')}
          />
        </Field>
      </div>
    </>
  );
}
