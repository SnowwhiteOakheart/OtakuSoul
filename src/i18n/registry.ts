import { de } from './locales/de';
import type { TranslationDictionary } from './locales/types';

export type SupportedLanguage = 'de' | 'en' | 'ru';

/**
 * Loaded dictionaries. German is the fallback and the key reference, so it is always there;
 * the other languages load on first use and stay out of the startup bundle.
 * Kept apart from `index.ts`, which imports the store, so the store can load languages.
 */
export const LOCALES: Partial<Record<SupportedLanguage, TranslationDictionary>> & { de: TranslationDictionary } = { de };

const LOADERS: Record<Exclude<SupportedLanguage, 'de'>, () => Promise<TranslationDictionary>> = {
  en: () => import('./locales/en').then((m) => m.en),
  ru: () => import('./locales/ru').then((m) => m.ru),
};

/** Loads `lang`; call before showing it, so the interface doesn't flash German first. */
export async function loadLocale(lang: SupportedLanguage): Promise<void> {
  if (lang === 'de' || LOCALES[lang]) return;
  LOCALES[lang] = await LOADERS[lang]();
}
