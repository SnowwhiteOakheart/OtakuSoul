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
  const expressions = extensions?.expressions ?? extensions?.custom_expressions;
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

const isAssetUrl = (url: string) => /^(asset:|https?:\/\/asset\.localhost)/i.test(url);
const blobUrls = new Map<string, Promise<string>>();

/**
 * An `asset://` file as blob URL. Under `tauri dev` the page comes from the Vite server
 * (`http://localhost:1420`) and WebKitGTK refuses `asset://` images there, although `fetch`
 * reads them fine; the bundled app (`tauri://localhost`) shows them directly.
 */
export const assetAsBlobUrl = (url: string): Promise<string> => {
  if (!isAssetUrl(url)) return Promise.reject(new Error('not an asset URL'));
  let pending = blobUrls.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    pending.catch(() => blobUrls.delete(url));
    blobUrls.set(url, pending);
  }
  return pending;
};

const decode = (url: string) =>
  new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error(`image failed: ${url.slice(0, 60)}`));
    image.src = url;
  });

/** A URL the webview can show for `url`: directly, else (asset files) as blob URL. */
export const loadDisplayableImage = (url: string): Promise<string> =>
  decode(url).catch((error: unknown) => (isAssetUrl(url) ? assetAsBlobUrl(url).then(decode) : Promise.reject(error)));
