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

/** Frames per second of the living portrait: the motion is a fraction of a pixel per frame,
 *  so few frames look the same; WebKitGTK repaints the window for every one (60 fps in CSS
 *  kept a core busy and made typing lag). Speaking moves faster and gets more. */
export const PORTRAIT_FPS = 12;
export const PORTRAIT_SPEAKING_FPS = 20;

/** Transforms of the sway, breath and speech layers at `seconds`; `phase` (0-1) offsets
 *  portraits side by side, `speech` is the voice level (0-1). */
export function portraitPose(seconds: number, breath: number, phase: number, speech: number) {
  const breathing = (1 - Math.cos(((seconds + phase * 5) / breath) * 2 * Math.PI)) / 2;
  const sway = -Math.cos(((seconds + phase * 9) / (breath * 1.73)) * Math.PI);
  return {
    sway: `rotate(${(0.3 * sway).toFixed(3)}deg) translateX(${(0.25 * sway).toFixed(3)}%)`,
    breath: `scale(${(1 + 0.005 * breathing).toFixed(4)}, ${(1 + 0.014 * breathing).toFixed(4)}) translateY(${(-0.35 * breathing).toFixed(3)}%)`,
    speech: `translateY(${(-1.4 * speech).toFixed(3)}%) scale(${(1 + 0.018 * speech).toFixed(4)})`,
  };
}
