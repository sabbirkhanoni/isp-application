import type { Permission } from '@isp/contracts';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/i18n-context';
import { useAuth } from './auth-context';
import { Loading } from '@/components/ui/page';

interface ProtectedRouteProps {
  permission?: Permission;
}

/** Gatekeeper for the UI. The API enforces the same rules; this only avoids showing dead ends. */
export function ProtectedRoute({ permission }: ProtectedRouteProps) {
  const { status, user, can } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (status === 'loading') return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (permission && !can(permission)) {
    return <p className="p-8 text-slate-600">{t.errors.forbidden}</p>;
  }
  return <Outlet />;
}
