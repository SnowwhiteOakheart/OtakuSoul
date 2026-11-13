import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import type { CharacterProfile } from '../types';

/**
 * The active figure's picture as a small data URL, for pages outside the app (phone web client,
 * OBS overlay). In the interface a card from disk carries an asset URL, which those pages cannot
 * load; the file is read over IPC and scaled down here instead, so a few KB travel instead of
 * the full card PNG.
 */
async function thumbnail(character: CharacterProfile, size: number): Promise<string> {
  const url = character.avatar_data_url ?? '';
  let image: CanvasImageSource & { width: number; height: number };
  if (url.startsWith('data:')) {
    const img = new Image();
    img.src = url;
    await img.decode();
    image = img;
  } else if (character.avatar_path) {
    const bytes = await api.readFileBinary(character.avatar_path);
    image = await createImageBitmap(new Blob([bytes as BlobPart]));
  } else {
    return '';
  }
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image && typeof image.close === 'function') image.close();
  // WebKitGTK may not encode WebP; it then returns a PNG, which is fine too.
  return canvas.toDataURL('image/webp', 0.85);
}

/**
 * Calls `onPortrait` with the active figure's picture (data URL of at most `size` px, '' for
 * none) now and whenever the figure or its picture changes. Returns the stop function.
 */
export function followPortrait(size: number, onPortrait: (dataUrl: string) => void): () => void {
  let key: string | null = null;
  const update = (character: CharacterProfile | null | undefined) => {
    const next = character ? `${character.id}|${character.avatar_data_url ?? ''}|${character.avatar_path ?? ''}` : '';
    if (next === key) return;
    key = next;
    if (!character) {
      onPortrait('');
      return;
    }
    thumbnail(character, size)
      .catch(() => '')
      .then((dataUrl) => {
        // A newer figure may have come in the meantime.
        if (key === next) onPortrait(dataUrl);
      });
  };
  update(useAppStore.getState().activeCharacter);
  return useAppStore.subscribe((s, prev) => {
    if (s.activeCharacter !== prev.activeCharacter) update(s.activeCharacter);
  });
}
