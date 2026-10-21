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

/**
 * The translation for `lang` in an `otakusoul_i18n` extension: the language's own, otherwise the
 * English one – unless `lang` is the declared source language, whose text is the base itself
 * (like `characters::i18n_translation`).
 */
export function pickTranslation<T>(i18n: unknown, lang: string): T | null {
  const value = i18n as { source_language?: string; translations?: Record<string, T> } | null | undefined;
  const own = value?.translations?.[lang];
  if (own) return own;
  const source = value?.source_language;
  if (!source || source === lang || source === 'en' || lang === 'en') return null;
  return value?.translations?.en ?? null;
}

const translationFor = (data: CharacterData, lang: string): CardTranslation | null =>
  pickTranslation<CardTranslation>(data.extensions?.[I18N_EXTENSION], lang);

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

/** Title and tone of a scene in `lang` (from `extensions.otakusoul_i18n`, like `SceneDefinition::localized`). */
export const localizeSceneHeader = (
  definition: { title: string; gm_tone: string; extensions?: unknown },
  lang: string,
): { title: string; gm_tone: string } => {
  const translation = pickTranslation<{ title?: string; gm_tone?: string }>(
    (definition.extensions as Record<string, unknown> | null | undefined)?.[I18N_EXTENSION], lang);
  return {
    title: translation?.title?.trim() || definition.title,
    gm_tone: translation?.gm_tone?.trim() || definition.gm_tone,
  };
};
