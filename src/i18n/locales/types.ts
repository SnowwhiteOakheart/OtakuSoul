import type { de } from './de';

export type TranslationKey = keyof typeof de;
export type TranslationDictionary = Record<TranslationKey, string>;
