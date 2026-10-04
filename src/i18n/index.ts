import { useAppStore } from '../store/useAppStore';
import { LOCALES, type SupportedLanguage } from './registry';
import type { TranslationKey } from './locales/types';

export type { TranslationKey } from './locales/types';
export { LOCALES, loadLocale, type SupportedLanguage } from './registry';
export type TranslationVars = Record<string, string | number>;
const de = LOCALES.de;

const interpolate = (text: string, vars?: TranslationVars): string =>
  vars ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

/**
 * Translates `key` into `lang`, falling back to German and then to the key itself.
 * Placeholders are written as `{{name}}`.
 */
export function t(key: TranslationKey | string, lang: SupportedLanguage = 'de', vars?: TranslationVars): string {
  const text =
    (LOCALES[lang] as Record<string, string> | undefined)?.[key] ?? (de as Record<string, string>)[key] ?? key;
  return interpolate(text, vars);
}

/**
 * Plural-aware translation: looks up `${base}_${category}` where category comes from
 * Intl.PluralRules (de/en: one/other, ru: one/few/many/other) and falls back to `_other`.
 * `{{count}}` is filled in automatically.
 */
export function tPlural(base: string, count: number, lang: SupportedLanguage = 'de', vars?: TranslationVars): string {
  const category = new Intl.PluralRules(lang).select(count);
  const dict = (LOCALES[lang] ?? de) as Record<string, string>;
  const key = `${base}_${category}` in dict ? `${base}_${category}` : `${base}_other`;
  return t(key, lang, { count, ...vars });
}

/** Localized name of a GoEmotions label ("joy" → "Freude"); unknown labels are returned unchanged. */
export function emotionLabel(emotion: string, lang: SupportedLanguage = 'de'): string {
  const key = `emotion.${emotion}`;
  return key in de ? t(key, lang) : emotion;
}

/** Translates `key` if it exists, otherwise returns `fallback` (backend codes and user data). */
export function tOptional(key: string, fallback: string, lang: SupportedLanguage = 'de'): string {
  return key in de ? t(key, lang) : fallback;
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
