import { convertFileSrc } from '@tauri-apps/api/core';
import { CharacterProfile } from '../types';

/** Expression slots a character can have a portrait for; labels are the `portrait.<key>` translations. */
export const PORTRAIT_MOODS = [
  { key: 'neutral' },
  { key: 'happy' },
  { key: 'sad' },
  { key: 'angry' },
  { key: 'surprised' },
  { key: 'relaxed' },
] as const;

export type PortraitMood = (typeof PORTRAIT_MOODS)[number]['key'];
export type PortraitExpressionMap = Record<string, string>;

export const getPortraitExpressions = (
  character: CharacterProfile | null
): PortraitExpressionMap => {
  const extensions = character?.card.data.extensions;
  const expressions = extensions?.expressions;
  const legacyExpressions = extensions?.sow_expressions;

  if (expressions && typeof expressions === 'object' && !Array.isArray(expressions)) {
    return expressions as PortraitExpressionMap;
  }

  if (legacyExpressions && typeof legacyExpressions === 'object' && !Array.isArray(legacyExpressions)) {
    return legacyExpressions as PortraitExpressionMap;
  }

  return {};
};

export const resolveCharacterImageSource = (
  imageSource: string | undefined,
  characterSourcePath?: string
): string | undefined => {
  if (!imageSource) return undefined;

  if (/^(data:|blob:|https?:\/\/|asset:)/i.test(imageSource)) {
    return imageSource;
  }

  const filePath = resolveCharacterImagePath(imageSource, characterSourcePath);
  return filePath ? convertFileSrc(filePath) : imageSource;
};

export const resolveCharacterImagePath = (
  imageSource: string | undefined,
  characterSourcePath?: string
): string | undefined => {
  if (!imageSource || /^(data:|blob:|https?:\/\/|asset:)/i.test(imageSource)) {
    return undefined;
  }

  const normalizedImageSource = imageSource.replace(/\\/g, '/');
  const isAbsolute = normalizedImageSource.startsWith('/') || /^[a-z]:\//i.test(normalizedImageSource);
  if (isAbsolute) return normalizedImageSource;
  if (!characterSourcePath) return undefined;

  const normalizedCharacterPath = characterSourcePath.replace(/\\/g, '/');
  const lastSeparator = normalizedCharacterPath.lastIndexOf('/');
  const parentDirectory = lastSeparator >= 0
    ? normalizedCharacterPath.slice(0, lastSeparator)
    : '.';

  return `${parentDirectory}/${normalizedImageSource}`;
};

export const selectCharacterPortrait = (
  character: CharacterProfile | null,
  detectedEmotion: string,
  canonicalMood: string
): string | undefined => {
  const expressions = getPortraitExpressions(character);
  const selected =
    expressions[detectedEmotion] ||
    expressions[canonicalMood] ||
    expressions.neutral;

  return resolveCharacterImageSource(selected, character?.source_path) || character?.avatar_data_url;
};
