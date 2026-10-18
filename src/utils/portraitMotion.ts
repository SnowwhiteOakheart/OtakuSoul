import type { EmotionResult } from '../types';

/** Device preference (localStorage) for the living portrait; on unless switched off. */
export const PORTRAIT_MOTION_KEY = 'otakusoul.portrait.motion';

export const readPortraitMotion = (): boolean => {
  try {
    return localStorage.getItem(PORTRAIT_MOTION_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const storePortraitMotion = (on: boolean) => {
  try {
    localStorage.setItem(PORTRAIT_MOTION_KEY, String(on));
  } catch (error) {
    console.warn('Ansicht konnte nicht gespeichert werden:', error);
  }
};

const FAST = new Set(['fear', 'nervousness', 'anger', 'excitement', 'desire', 'surprise']);
const FASTEST = new Set(['aroused', 'ecstasy', 'fear']);
const SLOW = new Set(['relief', 'sadness', 'grief', 'neutral']);
const SLOWEST = new Set(['afterglow', 'relaxed', 'crying']);

/** Seconds per breath for an expression: quicker when tense or excited, calmer when at ease. */
export function breathSeconds(emotion: Pick<EmotionResult, 'emotion' | 'vrm_expression'> & { portrait?: string }): number {
  const slot = emotion.portrait ?? '';
  if (FASTEST.has(slot)) return 2.6;
  if (SLOWEST.has(slot)) return 5.8;
  if (FAST.has(emotion.emotion)) return 3.2;
  if (SLOW.has(emotion.emotion)) return 4.8;
  return 4.2;
}
