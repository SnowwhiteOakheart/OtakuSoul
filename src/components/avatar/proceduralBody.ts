/**
 * Procedural body motion for avatars without (or between) imported motions: breathing, a slow
 * weight shift, arms that hang and drift, relaxed fingers, a walk cycle, and arms that lag
 * behind when the desktop pet's window is moved, thrown or falls. Pure functions of time and
 * input, as Euler angles (radians, order XYZ) per VRM humanoid bone on the normalized rig,
 * whose rest pose is the T-pose with all bones aligned to the world axes.
 */

export type Euler3 = [number, number, number];
export type BodyPose = Partial<Record<BodyBone, Euler3>>;

export type BodyBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'rightUpperLeg'
  | 'leftLowerLeg'
  | 'rightLowerLeg'
  | 'leftFoot'
  | 'rightFoot'
  | FingerBone;

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const;
type FingerBone =
  | `${'left' | 'right'}${(typeof FINGERS)[number]}${(typeof SEGMENTS)[number]}`
  | `${'left' | 'right'}Thumb${'Metacarpal' | 'Proximal' | 'Distal'}`;

/** Curl of the relaxed fingers per segment (radians), from the knuckle to the tip. */
const FINGER_CURL: Record<(typeof SEGMENTS)[number], number> = { Proximal: 0.28, Intermediate: 0.42, Distal: 0.25 };
/** Little fingers curl a bit more than index fingers, as in a hand at rest. */
const FINGER_SPREAD: Record<(typeof FINGERS)[number], number> = { Index: 0.85, Middle: 1, Ring: 1.1, Little: 1.2 };

/** How far the lowered arm hangs down from the T-pose (radians around the body's front axis). */
const ARM_DOWN = 1.25;
/** Walk cycles per second (two steps each): a calm stroll. */
export const WALK_CYCLE_HZ = 1.1;

export interface BodyInput {
  /** Seconds since the avatar appeared. */
  t: number;
  /** Direction of each arm chain along X in the normalized rig (+1 or -1; VRM 0.x may flip it). */
  leftArm: number;
  rightArm: number;
  /** Phase of the walk cycle (radians), or null when standing. */
  walkPhase: number | null;
  /** Lag of the body behind the window's movement (from `BodySway`), about -1…1. */
  sway: { x: number; y: number };
  /** Where the figure looks (-1…1, smoothed): neck and chest turn a little along. */
  look: { x: number; y: number };
}

/** Smooth pseudo-noise from incommensurate sines: never repeats visibly, stays within ±1. */
export function drift(t: number, seed: number): number {
  return 0.55 * Math.sin(t * 0.31 + seed) + 0.3 * Math.sin(t * 0.73 + seed * 2.1) + 0.15 * Math.sin(t * 1.37 + seed * 3.7);
}

/** The procedural pose for this moment. */
export function bodyPose({ t, leftArm, rightArm, walkPhase, sway, look }: BodyInput): BodyPose {
  const breath = Math.sin(t * 1.8);
  // Weight shift: the hips sway slowly from one leg to the other, the spine leans back against it.
  const shift = 0.022 * drift(t, 0.4);
  const twist = 0.018 * drift(t, 2.2);
  const walking = walkPhase !== null;
  const step = walkPhase ?? 0;

  const pose: BodyPose = {
    hips: [0, twist + (walking ? 0.07 * Math.sin(step) : 0), shift],
    spine: [breath * 0.012, -twist * 0.5 + look.x * 0.03 - (walking ? 0.05 * Math.sin(step) : 0), -shift * 0.6],
    chest: [breath * 0.016 - look.y * 0.02, look.x * 0.04, -shift * 0.3],
    neck: [-look.y * 0.05, look.x * 0.07, 0],
  };

  for (const [side, dir, seed] of [
    ['left', leftArm, 0],
    ['right', rightArm, 1.7],
  ] as const) {
    // A swing forward/back while walking (against the leg on the same side), otherwise a slow drift.
    const legPhase = side === 'left' ? step : step + Math.PI;
    const swing = walking ? -0.28 * Math.sin(legPhase) : 0.05 * drift(t, seed + 5);
    // Shoulders rise a little with each breath.
    pose[`${side}Shoulder`] = [0, 0, -dir * (0.02 + breath * 0.012)];
    // The window's movement: arms lag behind sideways and rise when it drops (or is thrown up).
    const lift = Math.max(-0.2, Math.min(0.9, sway.y * 0.9));
    const lagSide = sway.x * 0.5;
    pose[`${side}UpperArm`] = [
      0.1 + swing,
      -dir * 0.05,
      -dir * (ARM_DOWN - breath * 0.015 + 0.04 * drift(t, seed + 1) - lift) + lagSide,
    ];
    pose[`${side}LowerArm`] = [0.05, -dir * (0.3 + 0.08 * drift(t, seed + 2) + (walking ? 0.15 : 0)), 0];
    pose[`${side}Hand`] = [0.06 * drift(t, seed + 3), -dir * 0.1, -dir * 0.08 * drift(t, seed + 4)];
    // Relaxed fingers: curled towards the palm (down in the T-pose), thumbs in a little.
    for (const finger of FINGERS) {
      for (const segment of SEGMENTS) {
        pose[`${side}${finger}${segment}`] = [0, 0, -dir * FINGER_CURL[segment] * FINGER_SPREAD[finger]];
      }
    }
    pose[`${side}ThumbMetacarpal`] = [0, -dir * 0.25, 0];
    pose[`${side}ThumbProximal`] = [0, -dir * 0.15, 0];
  }

  if (walking) {
    for (const side of ['left', 'right'] as const) {
      const phase = side === 'left' ? step : step + Math.PI;
      // Thigh swings back and forth, the knee bends while the leg comes forward, the foot stays level.
      const thigh = 0.3 * Math.sin(phase);
      const knee = 0.08 + 0.5 * Math.max(0, -Math.cos(phase));
      pose[`${side}UpperLeg`] = [thigh - knee * 0.5, 0, 0];
      pose[`${side}LowerLeg`] = [knee, 0, 0];
      pose[`${side}Foot`] = [-thigh * 0.4 - knee * 0.3, 0, 0];
    }
  } else {
    // Standing: the leg that carries the weight is straight, the other knee gives a little.
    const relaxed = 0.04 + 0.04 * drift(t, 0.4);
    pose.leftUpperLeg = [-relaxed * (shift > 0 ? 1 : 0.3), 0, 0];
    pose.rightUpperLeg = [-relaxed * (shift > 0 ? 0.3 : 1), 0, 0];
    pose.leftLowerLeg = [relaxed * (shift > 0 ? 2 : 0.6), 0, 0];
    pose.rightLowerLeg = [relaxed * (shift > 0 ? 0.6 : 2), 0, 0];
  }
  return pose;
}

/**
 * The body's lag behind the window: a damped spring pulled by the window's acceleration. Fed
 * with how far the window moved (in window heights) since the last frame; `offset` then says
 * how far arms and hair trail (x: sideways, y: up when the window drops).
 */
export class BodySway {
  offset = { x: 0, y: 0 };
  private speed = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };

  /** Advances by `dt` seconds after the window moved by (dx, dy) window heights (y down). */
  update(dx: number, dy: number, dt: number) {
    if (dt <= 0) return;
    // Window velocity, smoothed: the physics moves it in steps of ~33 ms.
    const smooth = Math.min(1, dt * 12);
    const vx = dx / dt;
    const vy = dy / dt;
    const ax = (vx - this.speed.x) * smooth;
    const ay = (vy - this.speed.y) * smooth;
    this.speed.x += ax;
    this.speed.y += ay;
    // A spring back to rest, pushed against the acceleration (inertia), plus air drag at speed.
    const stiffness = 40;
    const damping = 7;
    const push = 0.9;
    const fx = -stiffness * this.offset.x - damping * this.velocity.x - (ax / dt) * push * 0.02 - this.speed.x * 8;
    const fy = -stiffness * this.offset.y - damping * this.velocity.y + (ay / dt) * push * 0.02 + this.speed.y * 8;
    this.velocity.x += fx * dt;
    this.velocity.y += fy * dt;
    this.offset.x = clamp(this.offset.x + this.velocity.x * dt);
    this.offset.y = clamp(this.offset.y + this.velocity.y * dt);
  }

  /** The window's current speed (window heights per second; y down). */
  get windowSpeed(): { x: number; y: number } {
    return this.speed;
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
