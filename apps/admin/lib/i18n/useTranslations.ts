'use client';

import { useMemo } from 'react';
import { useLocale } from './LocaleContext';
import { translationsEn, type Translations } from './translations/en';
import type { Locale } from './translations/index';

export type { Locale, Translations };

/** Returns merged translations for the active locale (SO falls back to EN for missing keys). */
export function useTranslations(): typeof translationsEn {
  const { t } = useLocale();
  return t;
}

/** Access locale + setter without full translations object. */
export function useTranslationsLocale() {
  return useLocale();
}

/** For non-React code: get static EN labels. */
export function getEnglishTranslations(): typeof translationsEn {
  return translationsEn;
}

/** Memoized label map helper for status enums. */
export function useOrderStatusLabels() {
  const t = useTranslations();
  return useMemo(() => t.status.order, [t]);
}

export function usePaymentStatusLabels() {
  const t = useTranslations();
  return useMemo(() => t.status.payment, [t]);
}
