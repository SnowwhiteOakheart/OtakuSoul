import type germanFile from '../../presets/locales/ui/de.json';

/** German is the reference language: every key must exist in `presets/locales/ui/de.json` first. */
export type TranslationKey = Exclude<keyof typeof germanFile, '__meta'>;
export type TranslationDictionary = Record<TranslationKey, string>;
