import type { Language } from '@isp/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { bn } from './bn.js';
import { en, type Dictionary } from './en.js';

const DICTIONARIES: Record<Language, Dictionary> = { en, bn };
const STORAGE_KEY = 'isp.language';

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bn' || stored === 'en') return stored;
  } catch {
    // storage may be unavailable (private mode); fall through to the default
  }
  return 'bn';
}

interface I18nValue {
  language: Language;
  t: Dictionary;
  setLanguage(language: Language): void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best effort only
    }
  }, []);

  const value = useMemo(
    () => ({ language, t: DICTIONARIES[language], setLanguage }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
