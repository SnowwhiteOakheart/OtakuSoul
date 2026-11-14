/**
 * Desktop pet eating what it was fed: one timeline for the behaviour (mouth, face), the VRM
 * viewer (the hand brings the food to the mouth) and the pet window (the food gets smaller with
 * each bite). No three.js here. Times in seconds since it started eating.
 */

/** The whole meal: hand up, three bites with chewing, hand down. */
export const EAT_TOTAL_S = 3.4;
/** When the bites are taken. */
export const EAT_BITES_S = [0.75, 1.55, 2.35] as const;
/** The hand rises to the mouth until here … */
const RAISE_END_S = 0.5;
/** … and goes down again from here. */
const LOWER_START_S = 2.9;
/** The mouth opens this long before a bite. */
const OPEN_S = 0.22;
/** It shuts this fast at the bite. */
const SHUT_S = 0.08;
/**
 * Chewing speed (jaw cycles per second): a natural pace, and slow enough for the behaviour's
 * 100 ms ticks to draw it smoothly.
 */
const CHEW_HZ = 2.2;

/** A new `id` starts eating again (the viewer keeps its own clock from then on). */
export interface PetEat {
  id: number;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** How far the hand is at the mouth (0 down, 1 there). */
export function eatReach(t: number): number {
  if (t <= 0 || t >= EAT_TOTAL_S) return 0;
  if (t < RAISE_END_S) return smooth(t / RAISE_END_S);
  if (t > LOWER_START_S) return 1 - smooth((t - LOWER_START_S) / (EAT_TOTAL_S - LOWER_START_S));
  return 1;
}

/** Mouth opening (0…1): wide before each bite, shut at it, chewing in between. */
export function eatMouth(t: number): number {
  if (t <= 0 || t >= LOWER_START_S + 0.2) return 0;
  for (const bite of EAT_BITES_S) {
    if (t >= bite - OPEN_S && t < bite) return 0.75 * smooth((t - (bite - OPEN_S)) / OPEN_S);
    if (t >= bite && t < bite + SHUT_S) return 0.75 * (1 - (t - bite) / SHUT_S) + 0.05;
  }
  const last = [...EAT_BITES_S].reverse().find((bite) => t >= bite + SHUT_S);
  if (last === undefined) return 0;
  // Chewing: the jaw goes up and down, quieter towards the end.
  const fade = 1 - smooth((t - LOWER_START_S) / 0.2);
  return (0.08 + 0.2 * Math.abs(Math.sin(Math.PI * CHEW_HZ * (t - last)))) * fade;
}

/** Bites taken so far (0…3). */
export const bitesTaken = (t: number) => EAT_BITES_S.filter((bite) => t >= bite).length;
