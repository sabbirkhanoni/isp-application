import { useCallback } from 'react';
import { useI18n } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';

/** Turns any API failure into a short localized message for the user. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useI18n();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.status === 0) return t.common.networkError;
        if (error.status === 409) return t.errors.conflict;
        if (error.status === 400) return t.errors.validation;
        if (error.status === 403) return t.errors.forbidden;
      }
      return t.common.genericError;
    },
    [t],
  );
}
