/**
 * Desktop pet: what the hands do besides eating (`eatTimeline.ts`), shared by the behaviour
 * (when), the VRM viewer (where the hands go) and the pet window (the things held). No three.js.
 *
 * - `stretch`: both arms up over the head (a break reminder), then down again.
 * - `belly`: one hand on the belly, rubbing it (hungry).
 * - `carry`: one hand in front of the chest, holding something out (a letter).
 * - `read`: both hands in front, holding a book (focus mode).
 * - `ledge`: both hands up on a window's edge it caught, then pulling itself up.
 *
 * Times in seconds since the pose started; `carry` and `read` last until the behaviour ends them.
 */
export type HandPoseKind = 'stretch' | 'belly' | 'carry' | 'read' | 'ledge';

/** A new `id` starts the pose again (the viewer keeps its own clock from then on). */
export interface PetHands {
  kind: HandPoseKind;
  id: number;
}

/** Caught a window's edge: hangs this long … */
export const CLIMB_HANG_S = 1.1;
/** … then pulls itself up within this long. */
export const CLIMB_PULL_S = 0.9;
export const CLIMB_TOTAL_S = CLIMB_HANG_S + CLIMB_PULL_S;

/** How long a pose with an end takes (seconds); the others are held. */
export const HAND_POSE_S: Record<HandPoseKind, number> = {
  stretch: 2.8,
  belly: 2.6,
  carry: Number.POSITIVE_INFINITY,
  read: Number.POSITIVE_INFINITY,
  ledge: CLIMB_TOTAL_S,
};

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** How far the hands are in the pose (0 resting, 1 there): eased in, held, eased out at the end. */
export function handWeight(kind: HandPoseKind, t: number): number {
  if (t <= 0) return 0;
  const total = HAND_POSE_S[kind];
  // Caught at once (the hands are on the edge when it hangs), let go once it stands.
  const raise = kind === 'ledge' ? 0.08 : kind === 'stretch' ? 0.7 : 0.4;
  const lower = kind === 'ledge' ? 0.15 : kind === 'stretch' ? 0.6 : 0.4;
  if (t >= total) return 0;
  const up = smooth(t / raise);
  return Number.isFinite(total) ? Math.min(up, smooth((total - t) / lower)) : up;
}

/** Pulling up from the edge: 0 while it hangs, 1 once the body is up. */
export const climbLift = (t: number) => smooth((t - CLIMB_HANG_S) / CLIMB_PULL_S);

/** Stretching, the body leans back a little at the top (0…1). */
export const stretchArch = (t: number) => handWeight('stretch', t) * smooth((t - 0.5) / 0.8);
