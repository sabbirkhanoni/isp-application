import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'isp.theme';

function readStored(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // storage can be unavailable; follow the device setting
  }
  return 'system';
}

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
const resolve = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;

/** Runs before the first paint (main.tsx) so a dark-mode user never sees a white flash. */
export function applyStoredTheme(): void {
  document.documentElement.dataset['theme'] = resolve(readStored());
}

interface ThemeValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode(mode: ThemeMode): void;
  toggle(): void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(readStored()));

  useEffect(() => {
    const apply = () => {
      const next = resolve(mode);
      setResolved(next);
      document.documentElement.dataset['theme'] = next;
    };
    apply();
    if (mode !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best effort only
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolved,
      setMode,
      toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [mode, resolved, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
