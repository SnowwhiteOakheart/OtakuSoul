/**
 * Desktop pet held up and dropped: what the behaviour (`petBehavior.ts`) and the VRM pose
 * (`petHang.ts`) agree on. No three.js here, so the behaviour stays light.
 */

/**
 * Where the figure was grabbed: by the shoulders/neck (hangs upright, legs dangling; by the
 * collar like a kitten), the hips (folds over the hand), the feet (head down) or a hand (dangles
 * sideways from the raised arm).
 */
export type HangGrip = 'shoulder' | 'hip' | 'feet' | 'hand';

/**
 * A point in the pet window: `x` sideways from its middle in window heights (negative is left),
 * `y` as share of its height from the top. The figure stands in the middle at the same size when
 * the window widens (it does while hanging), so such a point stays on the same body part.
 */
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

/**
 * Held by a foot that the user drags along (the pet moves its window itself then): where the
 * held foot is drawn right now, where the floor is (share of the window's height from the top;
 * beyond 1 when it is below the window) and how long the body is from the foot to the top of
 * the head (window heights). Too near the floor, the body cannot hang straight down: it lies at
 * an angle, or flat on the floor, and is dragged along.
 */
export interface HangHold {
  anchor: HangPoint;
  floor: number;
  reach: number;
}

/**
 * Smallest swing (radians either way from hanging straight down) that keeps the head above the
 * floor: 0 with room enough, π/2 (lying flat) with the foot on the floor.
 */
export function groundAngle(hold: HangHold): number {
  const clearance = hold.floor - hold.anchor.y;
  if (clearance >= hold.reach) return 0;
  return Math.acos(Math.max(0, clearance) / Math.max(1e-3, hold.reach));
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
  // By a hand: the hand at the top, the body dangling an arm's length below it.
  if (grip === 'hand') return { x: Math.max(-0.2, Math.min(0.2, at.x * 0.5)), y: Math.max(0.06, top - 0.12) };
  if (grip === 'shoulder') {
    return {
      x: Math.max(-0.35, Math.min(0.35, at.x)),
      y: Math.max(0.12, Math.min(0.36, at.y)),
    };
  }
  if (grip === 'hip') return { x: 0, y: Math.max(0.25, Math.min(0.55, at.y)) };
  return { x: 0, y: Math.max(0.1, top - 0.08) };
}

/** How it lands after hanging like this: on the head from the feet, on the backside from the hips. */
export const landingFor = (grip: HangGrip): Landing => (grip === 'feet' ? 'head' : grip === 'hip' ? 'back' : 'feet');

/**
 * Held by the collar the legs kick in bursts like a kitten's, tiring over time (0…1 per moment,
 * `since`: seconds since grabbed): a first long burst, then one every few seconds.
 */
export function kittenKick(since: number): number {
  if (since < 0) return 0;
  const tired = 1 - 0.65 * Math.min(1, since / 15);
  if (since < 1.4) return tired;
  const phase = (since - 1.4) % 3.4;
  return phase < 0.9 ? tired * Math.sin((phase / 0.9) * Math.PI) : 0;
}

/**
 * Gravity in window heights per second² (the figure is about 0.8 window heights tall; for a
 * 1.6 m person that is 9.81 m/s² scaled down): the hanging body swings as a real pendulum.
 */
const GRAVITY = 4.9;
/** Air and joint friction of the swing (1/s): a few swings, then it hangs still. */
const SWING_DAMPING = 0.9;
/** Beyond the limit (just grabbed head down, toppling over) it moves much more sluggishly. */
const SWING_DAMPING_FAR = 2;
/** Hanging, it swings at most this far to either side (45°); at the limit it bounces back softly. */
export const SWING_LIMIT = Math.PI / 4;
/** Share of the speed kept (reversed) when the swing hits its limit. */
const SWING_BOUNCE = 0.3;
/** The hand's acceleration is cut beyond this (window heights/s²): jolts of the pointer data. */
const MAX_ACCEL = 60;
/**
 * Air resistance on the body (1/s): carried along steadily it trails behind (about 25° at two
 * window heights per second), instead of swinging freely to both sides.
 */
const AIR_DRAG = 1.2;
/** Grabbed head down from standing, it starts toppling with this speed (radians/s). */
export const TOPPLE_KICK = 2.5;

/** The same turn within -π…π. */
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The swing of the hanging body about the grip: angle from hanging still (radians, counter-clockwise on screen). */
export interface Swing {
  angle: number;
  speed: number;
  /** Has been within `SWING_LIMIT` since grabbed (from then on the limit holds). */
  hanging: boolean;
}

/**
 * Advances the pendulum by `dt` seconds. Gravity pulls it below the grip; the hand's
 * acceleration (`accel`, window heights/s², y down) pushes the other way (moved right, the body
 * swings out left), lifting fast weighs it down more, dropping makes it nearly weightless. The
 * air holds the body back against the hand's speed (`velocity`, window heights/s), so carried
 * along it trails behind. `length`: grip to the body's middle (window heights).
 */
export function swingStep(
  swing: Swing,
  accel: { x: number; y: number },
  velocity: { x: number },
  length: number,
  dt: number,
) {
  // A whole turn more or less is the same hang (toppled the other way round).
  swing.angle = wrapAngle(swing.angle);
  const ax = Math.max(-MAX_ACCEL, Math.min(MAX_ACCEL, accel.x));
  const ay = Math.max(-MAX_ACCEL, Math.min(MAX_ACCEL, accel.y));
  const gravity = Math.max(GRAVITY * 0.2, Math.min(GRAVITY * 3, GRAVITY - ay));
  const friction = Math.abs(swing.angle) > SWING_LIMIT ? SWING_DAMPING_FAR : SWING_DAMPING;
  // The body's middle moves sideways with the hand plus its own swing; the air pushes against that.
  const sideways = velocity.x + length * swing.speed * Math.cos(swing.angle);
  const air = -AIR_DRAG * sideways;
  const angular = (-gravity * Math.sin(swing.angle) + (air - ax) * Math.cos(swing.angle)) / length - friction * swing.speed;
  swing.speed += angular * dt;
  swing.angle += swing.speed * dt;
  if (Math.abs(swing.angle) <= SWING_LIMIT) swing.hanging = true;
  else if (swing.hanging) {
    // At the limit: held there, the outward speed turns into a small swing back.
    const side = Math.sign(swing.angle);
    swing.angle = side * SWING_LIMIT;
    if (Math.sign(swing.speed) === side) swing.speed *= -SWING_BOUNCE;
  }
  return swing;
}
