import type { SearchCustomerDto } from '@isp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Search, UserX, WifiOff, Wifi, CornerDownLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth/auth-context';
import { FALLBACK_ICON, NAV_ICONS } from '@/features/nav-icons';
import { NAV_ITEMS } from '@/features/navigation';
import { useI18n } from '@/i18n/i18n-context';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

const fetchSearch = async (q: string) =>
  (await api.get<SearchCustomerDto[]>(`/search?q=${encodeURIComponent(q)}`)).data;

interface Entry {
  key: string;
  to: string;
  node: React.ReactNode;
}

/** Opens from anywhere with Ctrl/⌘+K: find a customer by name, ID, mobile or PPPoE login, or jump to a screen. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t, language } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text.trim()), 180);
    return () => window.clearTimeout(id);
  }, [text]);

  useEffect(() => {
    if (open) {
      setText('');
      setDebounced('');
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const canSearch = can('CUSTOMER_READ');
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => fetchSearch(debounced),
    enabled: open && canSearch && debounced.length >= 1,
    staleTime: 10_000,
  });

  const pages = useMemo(() => {
    const q = text.trim().toLowerCase();
    return NAV_ITEMS.filter((n) => !n.permission || can(n.permission))
      .filter((n) => (q ? n.label(t).toLowerCase().includes(q) : false))
      .slice(0, 4);
  }, [text, can, t]);

  const money = useCallback((v: number) => formatMoney(v, language), [language]);

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [];
    for (const c of results.data ?? []) {
      list.push({
        key: `c-${c.id}`,
        to: `/customers/${c.id}`,
        node: (
          <div className="flex w-full items-center gap-3">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                c.status === 'ACTIVE' ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-500',
              )}
            >
              {c.fullName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{c.fullName}</span>
                {c.isFree && <Badge tone="good">{t.free.badge}</Badge>}
                {c.status === 'SUSPENDED' && (
                  <Badge tone="bad">{t.enums.customerStatus.SUSPENDED}</Badge>
                )}
                {c.status === 'TERMINATED' && (
                  <Badge tone="neutral">{t.enums.customerStatus.TERMINATED}</Badge>
                )}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {c.customerCode} · {c.phone}
                {c.area ? ` · ${c.area}` : ''}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
              {c.dueAmountPoisha > 0 ? (
                <span className="font-semibold text-red-600">
                  {t.palette.due} {money(c.dueAmountPoisha)}
                </span>
              ) : (
                <span className="text-emerald-600">{t.palette.clear}</span>
              )}
              {c.online === null ? null : c.online ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Wifi className="size-3" aria-hidden="true" /> {t.palette.online}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <WifiOff className="size-3" aria-hidden="true" /> {t.palette.offline}
                </span>
              )}
            </span>
          </div>
        ),
      });
    }
    for (const p of pages) {
      const Icon = NAV_ICONS[p.to] ?? FALLBACK_ICON;
      list.push({
        key: `p-${p.to}`,
        to: p.to,
        node: (
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="font-medium">{p.label(t)}</span>
          </span>
        ),
      });
    }
    return list;
  }, [results.data, pages, t, money]);

  useEffect(() => setIndex(0), [debounced, entries.length]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  if (!open) return null;
  const searching =
    canSearch && text.trim().length > 0 && (results.isFetching || text.trim() !== debounced);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t.palette.title}
    >
      <button
        type="button"
        aria-label={t.common.close}
        className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.palette.placeholder}
            aria-label={t.palette.placeholder}
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-slate-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(entries.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') go(entries[index]);
            }}
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-slate-500 sm:block">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {entries.map((entry, i) => (
            <li key={entry.key} role="option" aria-selected={i === index}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-colors',
                  i === index ? 'bg-brand-soft' : 'hover:bg-slate-50',
                )}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(entry)}
              >
                {entry.node}
              </button>
            </li>
          ))}
          {entries.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-500">
              <UserX className="size-6 text-slate-300" aria-hidden="true" />
              {text.trim() === '' ? t.palette.hint : searching ? t.common.loading : t.palette.none}
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-line bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>{t.palette.footer}</span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" aria-hidden="true" /> {t.palette.open}
          </span>
        </div>
      </div>
    </div>
  );
}
