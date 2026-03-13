'use client';

import { useMemo } from 'react';
import { translations, type Locale } from './translations';

const DEFAULT_LOCALE: Locale = 'en';

/** Simple hook to get translations. Locale can come from cookie/header/param; here we default to EN. */
export function useTranslations(locale?: Locale) {
  const lang = (locale ?? DEFAULT_LOCALE) in translations ? (locale as Locale) : DEFAULT_LOCALE;
  return useMemo(() => translations[lang], [lang]);
}
