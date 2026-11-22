import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CommandPalette } from '@/components/command-palette';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Avatar, LogoMark } from '@/components/ui/logo';
import { ThemeButton } from '@/components/ui/theme-button';
import { useAuth } from '@/features/auth/auth-context';
import { FALLBACK_ICON, NAV_ICONS } from '@/features/nav-icons';
import { NAV_ITEMS } from '@/features/navigation';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';

/** Mobile-first shell for field Staff: search in the top bar, icon navigation at the thumb. */
export function StaffLayout() {
  const { t } = useI18n();
  const { user, logout, can } = useAuth();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur">
        <span className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="font-bold tracking-tight">{t.appName}</span>
        </span>
        <div className="flex items-center gap-2">
          {can('CUSTOMER_READ') && (
            <button
              type="button"
              aria-label={t.palette.button}
              onClick={() => setPalette(true)}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface shadow-sm"
            >
              <Search className="size-4" />
            </button>
          )}
          <LanguageSwitcher />
          <ThemeButton />
        </div>
      </header>
      <main className="flex-1 space-y-4 p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Avatar name={user?.fullName ?? ''} />
            {user?.fullName}
          </p>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand-soft"
            onClick={() => void logout()}
          >
            {t.common.signOut}
          </button>
        </div>
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="Main"
      >
        {NAV_ITEMS.filter((item) => !item.permission || can(item.permission)).map((item) => {
          const Icon = NAV_ICONS[item.to] ?? FALLBACK_ICON;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-brand' : 'text-slate-500',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.to === '/' ? t.nav.home : item.label(t)}
            </NavLink>
          );
        })}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
