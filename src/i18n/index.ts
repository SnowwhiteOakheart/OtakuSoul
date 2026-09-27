import { useAppStore } from '../store/useAppStore';
import { de } from './locales/de';
import { en } from './locales/en';
import { ru } from './locales/ru';
import type { TranslationDictionary, TranslationKey } from './locales/types';

export type { TranslationKey } from './locales/types';
export type SupportedLanguage = 'de' | 'en' | 'ru';
export type TranslationVars = Record<string, string | number>;

export const LOCALES: Record<SupportedLanguage, TranslationDictionary> = { de, en, ru };

const interpolate = (text: string, vars?: TranslationVars): string =>
  vars ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

/**
 * Translates `key` into `lang`, falling back to German and then to the key itself.
 * Placeholders are written as `{{name}}`.
 */
export function t(key: TranslationKey | string, lang: SupportedLanguage = 'de', vars?: TranslationVars): string {
  const text =
    (LOCALES[lang] as Record<string, string>)[key] ?? (LOCALES.de as Record<string, string>)[key] ?? key;
  return interpolate(text, vars);
}

/** Localized name of a GoEmotions label ("joy" → "Freude"); unknown labels are returned unchanged. */
export function emotionLabel(emotion: string, lang: SupportedLanguage = 'de'): string {
  const key = `emotion.${emotion}`;
  return key in de ? t(key, lang) : emotion;
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
  return { t: translateKey, tEmotion: translateEmotion, currentLanguage: appLanguage };
}
