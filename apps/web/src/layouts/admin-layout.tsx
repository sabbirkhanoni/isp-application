import { ChevronDown, LogOut, Menu, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/command-palette';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { Avatar, LogoMark } from '@/components/ui/logo';
import { useAuth } from '@/features/auth/auth-context';
import { FALLBACK_ICON, NAV_ICONS } from '@/features/nav-icons';
import { NAV_ITEMS, type NavGroup } from '@/features/navigation';
import { useI18n } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { ThemeButton } from '@/components/ui/theme-button';

const GROUP_ORDER: readonly NavGroup[] = [
  'overview',
  'people',
  'billing',
  'network',
  'finance',
  'settings',
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand/15 text-white before:absolute before:inset-y-2 before:-left-1 before:w-1 before:rounded-full before:bg-brand'
      : 'text-slate-400 hover:bg-white/5 hover:text-white',
  );

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const visible = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
  return (
    <nav className="space-y-5" aria-label="Main">
      {GROUP_ORDER.map((group) => {
        const items = visible.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-0.5">
            {group !== 'overview' && (
              <p className="px-3 pb-1 text-xs font-semibold text-slate-500">
                {t.nav.groups[group]}
              </p>
            )}
            {items.map((item) => {
              const Icon = NAV_ICONS[item.to] ?? FALLBACK_ICON;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {item.label(t)}
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-1">
      <LogoMark />
      <span className="text-base font-bold tracking-tight text-white">{t.appName}</span>
    </div>
  );
}

function UserMenu() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <Avatar name={user?.fullName ?? ''} />
        <span className="hidden text-sm font-semibold sm:block">{user?.fullName}</span>
        <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{user?.fullName}</p>
            <p className="text-xs text-slate-500">{user ? t.roles[user.role] : ''}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t.common.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

/** Desktop-first shell for Admin: dark sidebar grouped by job, search always one click (or Ctrl+K) away. */
export function AdminLayout() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);

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
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto bg-ink p-4 md:flex">
        <Brand />
        <SideNav />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t.nav.close}
            className="absolute inset-0 bg-ink/60"
            onClick={() => setDrawer(false)}
          />
          <aside className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 overflow-y-auto bg-ink p-4 shadow-pop">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                aria-label={t.nav.close}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"
                onClick={() => setDrawer(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/85 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-6">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-xl border border-line bg-surface shadow-sm md:hidden"
            aria-label={t.nav.menu}
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu className="size-5" />
          </button>
          {can('CUSTOMER_READ') ? (
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 text-left text-sm text-slate-500 transition hover:border-slate-300 md:max-w-md"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t.palette.button}</span>
              <kbd className="ml-auto hidden rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] sm:block">
                Ctrl K
              </kbd>
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeButton />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
