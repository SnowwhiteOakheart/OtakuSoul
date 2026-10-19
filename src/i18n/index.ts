import { useAppStore } from '../store/useAppStore';
import { FALLBACKS, LOCALES, type SupportedLanguage } from './registry';
import type { TranslationKey } from './types';

export type { TranslationKey } from './types';
export { LOCALES, loadLocale, type SupportedLanguage } from './registry';
export type TranslationVars = Record<string, string | number>;

const interpolate = (text: string, vars?: TranslationVars): string =>
  vars ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

const lookup = (lang: SupportedLanguage | undefined, key: string): string | undefined =>
  lang ? (LOCALES[lang] as Record<string, string> | undefined)?.[key] : undefined;

/** German has every key; `in` checks against it must see an own `de.json` too. */
const reference = () => LOCALES.de as Record<string, string>;

/**
 * Translates `key` into `lang`, falling back to the language's own fallback (`__meta.fallback`),
 * then German and then to the key itself. Placeholders are written as `{{name}}`.
 */
export function t(key: TranslationKey | string, lang: SupportedLanguage = 'de', vars?: TranslationVars): string {
  const text = lookup(lang, key) ?? lookup(FALLBACKS[lang], key) ?? reference()[key] ?? key;
  return interpolate(text, vars);
}

/**
 * Plural-aware translation: looks up `${base}_${category}` where category comes from
 * Intl.PluralRules (de/en: one/other, ru: one/few/many/other) and falls back to `_other`.
 * `{{count}}` is filled in automatically.
 */
export function tPlural(base: string, count: number, lang: SupportedLanguage = 'de', vars?: TranslationVars): string {
  let category: Intl.LDMLPluralRule = 'other';
  try {
    category = new Intl.PluralRules(lang).select(count);
  } catch {
    // A tag the browser doesn't know: `_other` is always there.
  }
  const plural = `${base}_${category}`;
  const known = lookup(lang, plural) ?? lookup(FALLBACKS[lang], plural) ?? reference()[plural];
  const key = known !== undefined ? plural : `${base}_other`;
  return t(key, lang, { count, ...vars });
}

/** Localized name of a GoEmotions label ("joy" → "Freude"); unknown labels are returned unchanged. */
export function emotionLabel(emotion: string, lang: SupportedLanguage = 'de'): string {
  const key = `emotion.${emotion}`;
  return key in reference() ? t(key, lang) : emotion;
}

/** Translates `key` if it exists, otherwise returns `fallback` (backend codes and user data). */
export function tOptional(key: string, fallback: string, lang: SupportedLanguage = 'de'): string {
  return key in reference() ? t(key, lang) : fallback;
}

/** Translates with the current app language, for code outside React components (store actions, services). */
export function translate(key: TranslationKey, vars?: TranslationVars): string {
  return t(key, useAppStore.getState().appLanguage || 'de', vars);
}

/**
 * React hook to access translations; components re-render on language switch.
 */
export function useTranslation() {
  const appLanguage = useAppStore((s) => s.appLanguage) || 'de';
  // Rereading the files keeps the language but changes texts.
  useAppStore((s) => s.localeRevision);
  const translateKey = (key: TranslationKey, vars?: TranslationVars): string => t(key, appLanguage, vars);
  const translateEmotion = (emotion: string): string => emotionLabel(emotion, appLanguage);
  const translatePlural = (base: string, count: number, vars?: TranslationVars): string =>
    tPlural(base, count, appLanguage, vars);
  const translateOptional = (key: string, fallback: string): string => tOptional(key, fallback, appLanguage);
  return {
    t: translateKey,
    tEmotion: translateEmotion,
    tPlural: translatePlural,
    tOptional: translateOptional,
    currentLanguage: appLanguage,
  };
}
