import germanFile from '../../presets/locales/ui/de.json';
import { api } from '../services/api';
import type { UiLanguage } from '../types/generated/UiLanguage';
import type { TranslationDictionary } from './types';

/**
 * Interface language id: the name of a file in `presets/locales/ui/` or `<Daten>/locales/ui/`
 * (`de`, `en`, `ru` ship with the app; any other tag such as `pl` or `pt-BR` can be added there).
 */
export type SupportedLanguage = string;

const { __meta: germanMeta, ...de } = germanFile;

const shipped = (id: string, name: string, english_name: string): UiLanguage => ({
  id,
  name,
  english_name,
  author: germanMeta.author,
  version: germanMeta.version,
  fallback: null,
  translated: Object.keys(de).length,
  total: Object.keys(de).length,
  custom: false,
});

/** Until the backend lists the folders (and in tests or the browser): the shipped languages. */
export const SHIPPED_LANGUAGES: UiLanguage[] = [
  shipped('de', germanMeta.name, germanMeta.englishName),
  shipped('en', 'English', 'English'),
  shipped('ru', 'Русский', 'Russian'),
];

/**
 * Loaded dictionaries. German is the fallback and the key reference, so it is built in;
 * every other language comes from its JSON file on first use (through the backend).
 * Kept apart from `index.ts`, which imports the store, so the store can load languages.
 */
export const LOCALES: Record<SupportedLanguage, Partial<TranslationDictionary> | undefined> & {
  de: TranslationDictionary;
} = { de };

/** Language a dictionary falls back to before German (`__meta.fallback`, e.g. `en`). */
export const FALLBACKS: Record<SupportedLanguage, SupportedLanguage | undefined> = {};

export interface LoadLocaleOptions {
  /** `__meta.fallback` of the language, loaded along with it. */
  fallback?: string | null;
  /** The user folder has a file for this language; only then German is read from disk. */
  custom?: boolean;
  /** Read the file again (after the user changed it). */
  force?: boolean;
}

/** Loads `lang`; call before showing it, so the interface doesn't flash German first. */
export async function loadLocale(lang: SupportedLanguage, options: LoadLocaleOptions = {}): Promise<void> {
  const { fallback, custom = false, force = false } = options;
  if (!lang) return;
  if (fallback && fallback !== lang) FALLBACKS[lang] = fallback;
  if (lang === 'de') {
    // German is built in; an own `de.json` only changes single texts.
    if (force) LOCALES.de = de;
    if (custom && (force || LOCALES.de === de)) {
      LOCALES.de = { ...de, ...((await api.loadUiLanguage('de')) as Partial<TranslationDictionary>) };
    }
    return;
  }
  if (LOCALES[lang] && !force) return;
  LOCALES[lang] = (await api.loadUiLanguage(lang)) as Partial<TranslationDictionary>;
  const next = FALLBACKS[lang];
  if (next && next !== 'de' && next !== lang) await loadLocale(next, { force }).catch(() => {});
}
