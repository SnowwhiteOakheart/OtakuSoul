import type { CharacterData } from '../types';

/**
 * Card translations live in `extensions.otakusoul_i18n` (see `characters.rs`):
 * `{ source_language: 'de', translations: { en: { description: '…', … } } }`.
 * Cards without it, such as ones imported from the web, keep their base fields everywhere.
 */
export const I18N_EXTENSION = 'otakusoul_i18n';

const TRANSLATABLE_TEXT = [
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
  'system_prompt',
  'post_history_instructions',
  'creator_notes',
] as const;

type CardTranslation = Partial<Record<(typeof TRANSLATABLE_TEXT)[number] | 'custom_title' | 'sow_title', string>> & {
  alternate_greetings?: string[];
  tags?: string[];
};

const CODE_BY_REPLY_LANGUAGE: Record<string, string> = {
  deutsch: 'de',
  german: 'de',
  english: 'en',
  русский: 'ru',
  russian: 'ru',
  日本語: 'ja',
  japanese: 'ja',
  français: 'fr',
  french: 'fr',
  español: 'es',
  spanish: 'es',
};

/** ISO 639-1 code for a reply language name ("Deutsch" → "de"); codes pass through. */
export const languageCode = (replyLanguage: string): string => {
  const name = replyLanguage.trim().toLowerCase();
  return CODE_BY_REPLY_LANGUAGE[name] ?? name;
};

const translationFor = (data: CharacterData, lang: string): CardTranslation | null => {
  const i18n = data.extensions?.[I18N_EXTENSION] as { translations?: Record<string, CardTranslation> } | undefined;
  return i18n?.translations?.[lang] ?? null;
};

/** The card with its fields in `lang` where a translation exists; missing or empty fields keep the base text. */
export const localizeCard = (data: CharacterData, lang: string): CharacterData => {
  const translation = translationFor(data, lang);
  if (!translation) return data;
  const localized: CharacterData = { ...data };
  for (const key of TRANSLATABLE_TEXT) {
    const text = translation[key];
    if (typeof text === 'string' && text.trim()) localized[key] = text;
  }
  if (translation.alternate_greetings?.length) localized.alternate_greetings = translation.alternate_greetings;
  if (translation.tags?.length) localized.tags = translation.tags;
  const title = translation.custom_title ?? translation.sow_title;
  if (title) {
    localized.extensions = {
      ...data.extensions,
      custom_title: title,
      ...(data.extensions?.sow_title !== undefined ? { sow_title: title } : {}),
    };
  }
  return localized;
};

/** Replaces the SillyTavern macros {{char}} and {{user}} (any case) with the actual names. */
export const fillCardMacros = (text: string, charName: string, userName: string): string =>
  text.replace(/\{\{\s*char\s*\}\}/gi, charName).replace(/\{\{\s*user\s*\}\}/gi, userName);
