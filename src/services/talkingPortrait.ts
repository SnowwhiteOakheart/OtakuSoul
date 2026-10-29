import { api } from './api';
import type { Visemes } from './lipSync';
import type { HeadPlacement } from '../types/generated/HeadPlacement';
import type { TalkingSet } from '../types/generated/TalkingSet';

/** Window event when a character's head placement changed (detail: character id). */
export const TALKING_PORTRAIT_EVENT = 'talking-portrait-changed';

/** Below this voice level the mouth stays closed; below `FULL_LEVEL` it opens half. */
const SILENT_LEVEL = 0.06;
const FULL_LEVEL = 0.22;
/** Mouth shapes a set may lack (too slight to show): the closest one stands in. */
const STAND_INS: Record<keyof Visemes, (keyof Visemes)[]> = {
  aa: ['oh', 'ee'],
  ih: ['ee', 'aa'],
  ou: ['oh', 'aa'],
  ee: ['ih', 'aa'],
  oh: ['ou', 'aa'],
};

/**
 * The frame for this moment of the voice: the strongest mouth shape, half or fully open by
 * the level; null keeps the picture as it is (mouth closed).
 */
export function mouthFrame(visemes: Visemes | null, level: number, frames: Record<string, unknown>): string | null {
  if (!visemes || level < SILENT_LEVEL) return null;
  const [shape] = (Object.entries(visemes) as [keyof Visemes, number][]).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!shape) return null;
  const half = level < FULL_LEVEL;
  for (const candidate of [shape, ...STAND_INS[shape]]) {
    const names = half ? [`${candidate}_half`, candidate] : [candidate, `${candidate}_half`];
    const found = names.find((name) => name in frames);
    if (found) return found;
  }
  return null;
}

/** A picture (data, asset or blob URL) as base64 for the backend. */
async function pictureBase64(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const sets = new Map<string, Promise<TalkingSet>>();

/** The frames of a picture with this head placement (made once by the backend, then cached). */
export function talkingSet(src: string, placement: HeadPlacement): Promise<TalkingSet> {
  const key = `${src.length}:${src.slice(0, 64)}:${src.slice(-64)}:${placement.top}:${placement.chin}:${placement.center_x}`;
  let pending = sets.get(key);
  if (!pending) {
    pending = pictureBase64(src).then((image) => api.prepareTalkingPortrait(image, placement));
    pending.catch(() => sets.delete(key));
    sets.set(key, pending);
  }
  return pending;
}

/** A first guess where the head of a picture is. */
export async function guessPlacement(src: string): Promise<HeadPlacement> {
  return api.guessTalkingPortraitPlacement(await pictureBase64(src));
}
