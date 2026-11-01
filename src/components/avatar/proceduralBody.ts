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
/** Thigh swing while walking (radians each way): the small steps of a calm stroll. */
export const WALK_THIGH = 0.2;
/** Leg length (hip to sole) as share of the model height. */
const LEG_SHARE = 0.47;
/** Ground covered per walk cycle (two steps), in model heights. */
export const WALK_STRIDE = 4 * LEG_SHARE * Math.sin(WALK_THIGH);
/**
 * Walk cycles per second (two steps each). The desktop pet moves `WALK_PACE` window heights per
 * second (`petPhysics`), turned `WALK_TURN` towards its way (`petBehavior`); at this rate the
 * planted foot keeps pace with the ground instead of sliding (a test checks it).
 */
export const WALK_CYCLE_HZ = 1.1;
/** How far the hips drop between two steps (share of the model height). */
const WALK_BOB = 0.012;

/**
 * Height of the hips while walking, as share of the model height below their rest: highest
 * while one leg passes the other, lowest when both feet are on the ground.
 */
export const walkBob = (walkPhase: number | null): number => (walkPhase === null ? 0 : -WALK_BOB * Math.abs(Math.sin(walkPhase)));

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

/**
 * The pose for the rig's facing. The angles here are written for a rig that faces +Z with its
 * left arm along +X (VRM 1.0). A VRM 0.x rig faces -Z inside the model (three-vrm turns only the
 * whole scene round), its left arm runs along -X: there a turn about X goes the other way, so a
 * forward step, a bent knee or a forward lean would go backwards. Turns about Y are the same;
 * sideways (Z) angles already follow `leftArm`/`rightArm` where they matter.
 */
function forFacing(pose: BodyPose, leftArm: number): BodyPose {
  if (leftArm >= 0) return pose;
  for (const angles of Object.values(pose)) if (angles) angles[0] = -angles[0];
  return pose;
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
    // Walking: the pelvis turns with the stepping leg and dips towards the swinging one.
    hips: [0, twist + (walking ? 0.07 * Math.sin(step) : 0), shift + (walking ? 0.035 * Math.cos(step) : 0)],
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
    const swing = walking ? -1.2 * WALK_THIGH * Math.sin(legPhase) : 0.05 * drift(t, seed + 5);
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
      // Thigh swings back and forth, the knee bends while the leg comes forward; the foot rolls:
      // heel first in front (toes up), pushing off from the toes behind (toes down).
      const thigh = WALK_THIGH * Math.sin(phase);
      const knee = 0.06 + 0.55 * Math.max(0, -Math.cos(phase));
      pose[`${side}UpperLeg`] = [thigh - knee * 0.5, 0, 0];
      pose[`${side}LowerLeg`] = [knee, 0, 0];
      pose[`${side}Foot`] = [-thigh * 0.4 - knee * 0.3 + 0.2 * Math.sin(phase), 0, 0];
    }
  } else {
    // Standing: the leg that carries the weight is straight, the other knee gives a little.
    const relaxed = 0.04 + 0.04 * drift(t, 0.4);
    pose.leftUpperLeg = [-relaxed * (shift > 0 ? 1 : 0.3), 0, 0];
    pose.rightUpperLeg = [-relaxed * (shift > 0 ? 0.3 : 1), 0, 0];
    pose.leftLowerLeg = [relaxed * (shift > 0 ? 2 : 0.6), 0, 0];
    pose.rightLowerLeg = [relaxed * (shift > 0 ? 0.6 : 2), 0, 0];
  }
  return forFacing(pose, leftArm);
}

/** Height of the hips above the ground while sitting on it (share of the model height). */
export const FLOOR_SIT_HIPS = 0.09;

/**
 * Sitting on the ground, facing the viewer, knees drawn up and closed with the arms around them:
 * a calm pose that keeps the lap covered and stays compact towards the camera (legs stretched
 * forward came at the viewer and got cut off by the window edge). The back leans forward, the
 * head looks up again. `leftArm` is the rig's X direction (VRM 0.x may flip it), which sets where
 * "inwards" and "forwards" are. Laid out for the leg proportions of `LEG_SHARE` with the hips at
 * `FLOOR_SIT_HIPS`: thighs rise to the knees, the shins come down so the feet stand flat just
 * in front of the hips.
 */
export function floorSitPose(leftArm: number): BodyPose {
  const out = Math.sign(leftArm) || 1;
  const thigh = -2.2;
  const knee = 2.6;
  const pose: BodyPose = {
    spine: [0.22, 0, 0],
    chest: [0.1, 0, 0],
    neck: [-0.2, 0, 0],
    // Knees together (a little inwards), feet flat on the ground.
    leftUpperLeg: [thigh, 0, -out * 0.04],
    leftLowerLeg: [knee, 0, 0],
    leftFoot: [-(thigh + knee), 0, 0],
    rightUpperLeg: [thigh, 0, out * 0.04],
    rightLowerLeg: [knee, 0, 0],
    rightFoot: [-(thigh + knee), 0, 0],
    // Arms forward and down to the knees, elbows bent round them.
    leftUpperArm: [-0.8, 0, -out * 1.25],
    leftLowerArm: [0, -out * 1.1, 0],
    leftHand: [0, 0, 0],
    rightUpperArm: [-0.8, 0, out * 1.25],
    rightLowerArm: [0, out * 1.1, 0],
    rightHand: [0, 0, 0],
  };
  return forFacing(pose, out);
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
