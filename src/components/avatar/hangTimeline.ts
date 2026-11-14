/**
 * Desktop pet held up and dropped: what the behaviour (`petBehavior.ts`) and the VRM pose
 * (`petHang.ts`) agree on. No three.js here, so the behaviour stays light.
 */

/**
 * Where the figure was grabbed: by the shoulders/neck (hangs upright, legs dangling), the hips
 * (folds over the hand) or the feet (head down).
 */
export type HangGrip = 'shoulder' | 'hip' | 'feet';

/** A point in the viewer as shares of its size, from the top left. */
export interface HangPoint {
  x: number;
  y: number;
}

export interface Hang {
  grip: HangGrip;
  /** Where the user grabbed it. */
  at: HangPoint;
  /** Where the grabbed body part is drawn: the window moves so the pointer is there. */
  anchor: HangPoint;
}

/** What it landed on after being dropped: head (held by the feet), backside (by the hips) or feet. */
export type Landing = 'head' | 'back' | 'feet';

export interface Recover {
  kind: Landing;
  /** A new id starts getting up again. */
  id: number;
}

/**
 * Getting up, in seconds since the landing: until `impact` it lies as it fell, until `settle`
 * it tips or plops into sitting, until `rub` it sits rubbing its head or back, then stands up
 * (done at `total`). Landing on the feet is only a crouch that ends at `total`.
 */
export const RECOVER_PHASES: Record<Landing, { impact: number; settle: number; rub: number; total: number }> = {
  head: { impact: 0.3, settle: 1.1, rub: 3.1, total: 4.3 },
  back: { impact: 0.25, settle: 0.9, rub: 2.7, total: 3.9 },
  feet: { impact: 0.12, settle: 0.12, rub: 0.12, total: 1.1 },
};

/**
 * The grip at this height (share of the viewer from the top) for a figure drawn between `top`
 * and `feet`: the upper third is the shoulders (the head too: lifted by the collar), the middle
 * the hips, from about the knees down the feet.
 */
export function gripAt(y: number, top: number, feet: number): HangGrip {
  const along = (y - top) / Math.max(0.05, feet - top);
  return along < 0.36 ? 'shoulder' : along < 0.68 ? 'hip' : 'feet';
}

/**
 * Where the grabbed part is drawn while it hangs: the shoulders where they were grabbed; the
 * hips in the middle at their height (head and feet dangle down to about where the feet stood);
 * the feet at the figure's top, so the head ends at the floor line.
 */
export function hangAnchor(grip: HangGrip, at: HangPoint, top: number): HangPoint {
  if (grip === 'shoulder') return at;
  if (grip === 'hip') return { x: 0.5, y: at.y };
  return { x: 0.5, y: Math.max(0.03, top - 0.02) };
}

/** How it lands after hanging like this: on the head from the feet, on the backside from the hips. */
export const landingFor = (grip: HangGrip): Landing => (grip === 'feet' ? 'head' : grip === 'hip' ? 'back' : 'feet');
