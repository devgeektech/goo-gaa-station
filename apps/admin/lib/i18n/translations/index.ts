import { translationsEn } from './en';
import { translationsSo } from './so';
import { mergeWithEnglishFallback } from '../mergeTranslations';

export type Locale = 'en' | 'so';

export { translationsEn, translationsSo };

/** Pre-merged locale maps for static access. */
export const translations = {
  en: translationsEn,
  so: mergeWithEnglishFallback(translationsEn, translationsSo as Record<string, unknown>),
} as const;

export type TranslationKey = keyof typeof translationsEn;

/** Replace `{key}` placeholders in a translation string. */
export function formatT(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}
