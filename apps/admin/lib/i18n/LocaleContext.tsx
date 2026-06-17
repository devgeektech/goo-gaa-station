'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Locale } from './translations/index';
import { mergeWithEnglishFallback } from './mergeTranslations';
import { translationsEn } from './translations/en';
import { translationsSo } from './translations/so';

const STORAGE_KEY = 'admin-locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof translationsEn;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'so' ? 'so' : 'en';
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setHydrated(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const t = useMemo(() => {
    if (locale === 'so') {
      return mergeWithEnglishFallback(translationsEn, translationsSo as Record<string, unknown>);
    }
    return translationsEn;
  }, [locale]);

  const value = useMemo(
    () => ({ locale: hydrated ? locale : 'en', setLocale, t }),
    [hydrated, locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: 'en',
      setLocale: () => {},
      t: translationsEn,
    };
  }
  return ctx;
}
