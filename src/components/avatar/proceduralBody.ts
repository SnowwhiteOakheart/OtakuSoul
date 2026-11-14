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
  | 'leftToes'
  | 'rightToes'
  | FingerBone;

export type FloorSeatPose = 'hugKnees' | 'sideSit' | 'relaxedLegs' | 'crissCross';
export type EdgeSeatPose = 'dangle' | 'crossed' | 'lean';
export type SeatPose = FloorSeatPose | EdgeSeatPose;

export const FLOOR_SEAT_POSES: readonly FloorSeatPose[] = ['hugKnees', 'sideSit', 'relaxedLegs', 'crissCross'];
export const EDGE_SEAT_POSES: readonly EdgeSeatPose[] = ['dangle', 'crossed', 'lean'];

export interface SitHandPlacement {
  /** 0 = Hüfte, 1 = Knie, >1 = entlang des Schienbeins Richtung Knöchel. */
  alongLeg: number;
  /** Versatz nach vorn (in Modellhöhen). */
  forwardOffset: number;
  /** Versatz nach oben (in Modellhöhen). */
  upOffset: number;
  /** Seitlicher Versatz (+ nach außen, - nach innen zur Körpermitte, in Modellhöhen). */
  sideOffset: number;
}

export interface SitPoseSpec {
  pose: BodyPose;
  leftHand: SitHandPlacement;
  rightHand: SitHandPlacement;
}

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
  /** Aktuelle Emotion für natürliche Körperhaltung (optional). */
  mood?: string;
  /** Ob die Figur gerade spricht, für subtile Sprech-Körpersprache (optional). */
  speaking?: boolean;
}

interface PostureBias {
  spinePitch: number;
  chestPitch: number;
  neckPitch: number;
  neckRoll: number;
  shoulderDrop: number;
  elbowIn: number;
  swayScale: number;
}

const NEUTRAL_POSTURE: PostureBias = {
  spinePitch: 0,
  chestPitch: 0,
  neckPitch: 0,
  neckRoll: 0,
  shoulderDrop: 0,
  elbowIn: 0,
  swayScale: 1,
};

const MOOD_POSTURES: Record<string, PostureBias> = {
  happy: { ...NEUTRAL_POSTURE, chestPitch: -0.022, swayScale: 1.25 },
  ecstasy: { ...NEUTRAL_POSTURE, chestPitch: -0.022, swayScale: 1.25 },
  teasing: { ...NEUTRAL_POSTURE, chestPitch: -0.02, neckRoll: 0.03, swayScale: 1.2 },
  sad: { ...NEUTRAL_POSTURE, spinePitch: 0.045, chestPitch: 0.02, neckPitch: 0.07, shoulderDrop: 0.03, swayScale: 0.75 },
  crying: { ...NEUTRAL_POSTURE, spinePitch: 0.055, chestPitch: 0.025, neckPitch: 0.08, shoulderDrop: 0.035, swayScale: 0.7 },
  blush: { ...NEUTRAL_POSTURE, spinePitch: 0.01, neckPitch: 0.02, neckRoll: 0.045, shoulderDrop: 0.008, elbowIn: 0.12 },
  afterglow: { ...NEUTRAL_POSTURE, spinePitch: 0.01, neckPitch: 0.02, neckRoll: 0.04, elbowIn: 0.1, swayScale: 0.85 },
  seductive: { ...NEUTRAL_POSTURE, chestPitch: -0.015, neckRoll: 0.045, elbowIn: 0.1, swayScale: 1.1 },
  aroused: { ...NEUTRAL_POSTURE, chestPitch: 0.012, neckRoll: 0.03, elbowIn: 0.08 },
  angry: { ...NEUTRAL_POSTURE, spinePitch: 0.015, chestPitch: 0.025, shoulderDrop: -0.02, swayScale: 0.9 },
  disgust: { ...NEUTRAL_POSTURE, spinePitch: 0.015, chestPitch: 0.025, neckPitch: -0.015, shoulderDrop: -0.015, swayScale: 0.9 },
  surprised: { ...NEUTRAL_POSTURE, spinePitch: -0.03, chestPitch: -0.015, elbowIn: 0.15 },
  fear: { ...NEUTRAL_POSTURE, spinePitch: -0.025, neckPitch: 0.02, elbowIn: 0.18, shoulderDrop: -0.02 },
};

const postureForMood = (mood?: string): PostureBias => (mood ? MOOD_POSTURES[mood] ?? NEUTRAL_POSTURE : NEUTRAL_POSTURE);

/**
 * The pose for the rig's facing. The angles here are written for a rig that faces +Z with its
 * left arm along +X (VRM 1.0). A VRM 0.x rig faces -Z inside the model (three-vrm turns only the
 * whole scene round), its left arm runs along -X: there a turn about X goes the other way, so a
 * forward step, a bent knee or a forward lean would go backwards. The rig is the other one turned
 * half round the vertical axis: turns about X and Z go the other way, turns about Y stay. So Z
 * angles follow `leftArm`/`rightArm`, Y angles only the side (left/right), and X is turned here.
 */
export function forFacing(pose: BodyPose, leftArm: number): BodyPose {
  if (leftArm >= 0) return pose;
  for (const angles of Object.values(pose)) if (angles) angles[0] = -angles[0];
  return pose;
}

/** Smooth pseudo-noise from incommensurate sines: never repeats visibly, stays within ±1. */
export function drift(t: number, seed: number): number {
  return 0.55 * Math.sin(t * 0.31 + seed) + 0.3 * Math.sin(t * 0.73 + seed * 2.1) + 0.15 * Math.sin(t * 1.37 + seed * 3.7);
}

/** Wendet entspannte, leicht atmende Fingerkrümmung inklusive zeitversetzter Fingerwelle an. */
function applyRelaxedFingers(
  pose: BodyPose,
  side: 'left' | 'right',
  dir: number,
  t: number,
  seed: number,
  breath: number,
  curlScale = 1,
) {
  const across = side === 'left' ? 1 : -1;
  FINGERS.forEach((finger, fIdx) => {
    const wave = 1 + 0.06 * drift(t, seed + 9 + fIdx * 0.55) + 0.02 * breath;
    for (const segment of SEGMENTS) {
      pose[`${side}${finger}${segment}`] = [0, 0, -dir * FINGER_CURL[segment] * FINGER_SPREAD[finger] * wave * curlScale];
    }
  });
  pose[`${side}ThumbMetacarpal`] = [0, -across * (0.25 * curlScale), 0];
  pose[`${side}ThumbProximal`] = [0, -across * (0.15 * curlScale), 0];
  pose[`${side}ThumbDistal`] = [0, -across * (0.12 + 0.03 * drift(t, seed + 11)) * curlScale, 0];
}

/** The procedural pose for this moment. */
export function bodyPose({ t, leftArm, rightArm, walkPhase, sway, look, mood, speaking = false }: BodyInput): BodyPose {
  const bias = postureForMood(mood);
  const breath = Math.sin(t * 1.8);
  const breathLag = Math.sin(t * 1.8 - 0.25);
  // Phasenverzögerte Gewichtsverlagerung: Hüfte führt, Wirbelsäule und Brustkorb gleichen zeitversetzt aus.
  const shift = 0.024 * bias.swayScale * drift(t, 0.4);
  const spineShift = 0.024 * bias.swayScale * drift(t - 0.18, 0.4);
  const chestShift = 0.024 * bias.swayScale * drift(t - 0.34, 0.4);
  const twist = 0.02 * bias.swayScale * drift(t, 2.2);
  const spineTwist = 0.02 * bias.swayScale * drift(t - 0.18, 2.2);
  const walking = walkPhase !== null;
  const step = walkPhase ?? 0;
  const talkNod = speaking ? Math.sin(t * 4.1) * 0.022 + 0.015 * drift(t * 1.6, 5.3) : 0;
  const talkTilt = speaking ? 0.018 * drift(t * 1.2, 7.1) : 0;
  const talkChest = speaking ? Math.sin(t * 2.05) * 0.01 : 0;
  const armDir = Math.sign(leftArm) || 1;
  // Stetiger Contrapposto-Gewichtsübergang (0 = rechts tragend, 1 = links tragend).
  const leftWeight = walking ? 0.5 : 0.5 + 0.5 * Math.tanh(shift * 42);

  const pose: BodyPose = {
    // Hüfte führt mit leichter Beckendrehung & Beckenhebung zur Standbeinseite.
    hips: [
      walking ? 0.018 * Math.cos(step * 2) : 0,
      twist + (walking ? 0.075 * Math.sin(step) : armDir * 0.03 * (leftWeight - 0.5)),
      shift + (walking ? 0.038 * Math.cos(step) : 0.014 * (leftWeight - 0.5)),
    ],
    spine: [
      breath * 0.012 + bias.spinePitch * (walking ? 0.5 : 1),
      -spineTwist * 0.5 + look.x * 0.03 - (walking ? 0.05 * Math.sin(step - 0.1) : 0),
      -spineShift * 0.65,
    ],
    chest: [
      breath * 0.016 - look.y * 0.02 + bias.chestPitch + talkChest,
      look.x * 0.04 - (walking ? 0.025 * Math.sin(step - 0.2) : 0),
      -chestShift * 0.3,
    ],
    upperChest: [
      breathLag * 0.01 + bias.chestPitch * 0.4 + talkChest * 0.6,
      look.x * 0.025 - (walking ? 0.02 * Math.sin(step - 0.25) : spineTwist * 0.2),
      -chestShift * 0.15,
    ],
    neck: [
      -look.y * 0.05 + bias.neckPitch + talkNod - breathLag * 0.006,
      look.x * 0.07,
      armDir * (bias.neckRoll + talkTilt - shift * 0.25),
    ],
  };

  const lift = Math.max(-0.2, Math.min(0.9, sway.y * 0.9));
  for (const [side, dir, seed] of [
    ['left', leftArm, 0],
    ['right', rightArm, 1.7],
  ] as const) {
    // Drehungen um Y sind auf beiden Rig-Typen gleich; Z-Winkel folgen `dir`, X-Winkel dreht `forFacing`.
    const across = side === 'left' ? 1 : -1;
    const legPhase = side === 'left' ? step : step + Math.PI;
    const swing = walking ? -1.2 * WALK_THIGH * Math.sin(legPhase) : 0.055 * bias.swayScale * drift(t, seed + 5);
    const walkElbow = walking ? 0.08 + 0.14 * Math.max(0, -Math.sin(legPhase - 0.35)) : 0;
    const talkHand = speaking ? 0.09 * (0.5 + 0.5 * drift(t * 1.4, seed + 6)) : 0;
    const talkWrist = speaking ? 0.04 * drift(t * 1.9, seed + 8) : 0;
    // Schlüsselbein / Schulter folgt Atmung, Armschwung und Fensterbewegung.
    pose[`${side}Shoulder`] = [
      swing * 0.06,
      -across * swing * 0.05,
      -dir * (0.02 + breath * 0.012 + bias.shoulderDrop - lift * 0.06),
    ];
    const lagSide = sway.x * 0.5;
    pose[`${side}UpperArm`] = [
      0.1 + swing,
      -across * (0.05 + 0.03 * drift(t - 0.15, seed + 1.3)),
      -dir * (ARM_DOWN - breath * 0.015 + 0.04 * drift(t, seed + 1) - lift) + lagSide,
    ];
    pose[`${side}LowerArm`] = [
      0.05 + 0.025 * drift(t - 0.2, seed + 2.3),
      -across * (0.3 + 0.08 * drift(t - 0.18, seed + 2) + (walking ? 0.15 : 0) + walkElbow + bias.elbowIn + talkHand),
      0,
    ];
    pose[`${side}Hand`] = [
      0.06 * drift(t - 0.32, seed + 3) + talkWrist - (walking ? 0.06 * Math.sin(legPhase - 0.45) : 0),
      -across * (0.1 + 0.03 * drift(t - 0.25, seed + 3.5)),
      -dir * (0.08 * drift(t - 0.3, seed + 4)),
    ];
    applyRelaxedFingers(pose, side, dir, t, seed, breath);
  }

  if (walking) {
    for (const [side, dir] of [
      ['left', leftArm],
      ['right', rightArm],
    ] as const) {
      const phase = side === 'left' ? step : step + Math.PI;
      // 3-Phasen-Gang: Hüftschwung, phasenverschobenes Schwungbein-Knie + Standbein-Nachgeben, Fußabrollen + Zehenabstoß.
      const thigh = WALK_THIGH * Math.sin(phase);
      const swingKnee = 0.55 * Math.max(0, -Math.cos(phase - 0.12));
      const stanceYield = 0.06 * Math.max(0, Math.sin(phase));
      const knee = 0.05 + swingKnee + stanceYield;
      pose[`${side}UpperLeg`] = [thigh - knee * 0.5, 0, -dir * 0.02 * Math.cos(phase)];
      pose[`${side}LowerLeg`] = [knee, 0, 0];
      pose[`${side}Foot`] = [-thigh * 0.4 - knee * 0.3 + 0.2 * Math.sin(phase), 0, 0];
      pose[`${side}Toes`] = [0.24 * Math.max(0, Math.sin(phase - 0.2)) - 0.06 * Math.max(0, -Math.sin(phase)), 0, 0];
    }
  } else {
    // Contrapposto im Stehen: Standbein gestreckt, entlastetes Bein gibt weich nach & hält den Fuß geerdet.
    const baseBend = 0.045 + 0.035 * drift(t, 0.4);
    const leftRel = baseBend * leftWeight + 0.015 * (1 - leftWeight);
    const rightRel = baseBend * (1 - leftWeight) + 0.015 * leftWeight;
    pose.leftUpperLeg = [-leftRel * 0.9, 0.03 * leftWeight, Math.sign(leftArm) * 0.018 * leftWeight];
    pose.rightUpperLeg = [-rightRel * 0.9, -0.03 * (1 - leftWeight), Math.sign(rightArm) * 0.018 * (1 - leftWeight)];
    pose.leftLowerLeg = [leftRel * 1.9, 0, 0];
    pose.rightLowerLeg = [rightRel * 1.9, 0, 0];
    pose.leftFoot = [-leftRel * 0.95, 0.02 * leftWeight, 0];
    pose.rightFoot = [-rightRel * 0.95, -0.02 * (1 - leftWeight), 0];
    pose.leftToes = [0.04 * leftWeight, 0, 0];
    pose.rightToes = [0.04 * (1 - leftWeight), 0, 0];
  }
  return forFacing(pose, leftArm);
}

/** A leg as measured on the model: thigh (hip joint to knee) and shin (knee to ankle). */
export interface LegLengths {
  thigh: number;
  shin: number;
}

/** A leg's angles: flexion at the hip (forward, from hanging down) and bend at the knee (radians). */
export interface LegAngles {
  flex: number;
  bend: number;
}

/**
 * Two-joint leg reaching the ankle `reach` in front of the hip joint and `drop` below it, knee up:
 * the sitting legs follow the model's own proportions, so feet and seat end on the same ground.
 */
export function legReach({ thigh, shin }: LegLengths, reach: number, drop: number): LegAngles {
  const longest = thigh + shin - 1e-4;
  const shortest = Math.abs(thigh - shin) + 1e-4;
  const dist = Math.min(longest, Math.max(shortest, Math.hypot(reach, drop)));
  const atHip = Math.acos(Math.min(1, Math.max(-1, (thigh * thigh + dist * dist - shin * shin) / (2 * thigh * dist))));
  const atKnee = Math.acos(Math.min(1, Math.max(-1, (thigh * thigh + shin * shin - dist * dist) / (2 * thigh * shin))));
  const below = Math.atan2(drop, reach);
  return { flex: Math.PI / 2 - below + atHip, bend: Math.PI - atKnee };
}

/** Sitting on the ground with knees drawn up, when the legs were not measured. */
const DEFAULT_SIT_LEGS: LegAngles = { flex: 2.2, bend: 2.6 };
/** Default normalized leg proportions when no rig lengths were measured yet. */
const DEFAULT_LEG_LENGTHS: LegLengths = { thigh: 0.4, shin: 0.38 };
/** Sitting on an edge: thighs level, shins hanging down relaxed so feet stay inside the sunk window. */
export const EDGE_SIT_LEGS: LegAngles = { flex: Math.PI / 2, bend: 1.42 };

function mulQuat(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/**
 * Wandelt anatomische Hüftwinkel (Vorbeugen `flex`, Abduktion `abduct` nach außen links = +,
 * Außenrotation `extRot`) in exakt äquivalente VRM-XYZ-Eulerwinkel um.
 */
function legEulerXYZ(flex: number, abduct: number, extRot: number, out = 1): Euler3 {
  const qx: [number, number, number, number] = [-Math.sin(flex / 2), 0, 0, Math.cos(flex / 2)];
  const qz: [number, number, number, number] = [0, 0, Math.sin(abduct / 2), Math.cos(abduct / 2)];
  const qy: [number, number, number, number] = [0, Math.sin(extRot / 2), 0, Math.cos(extRot / 2)];
  const [x, y, z, w] = mulQuat(mulQuat(qx, qz), qy);
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(clamp(m13));
  let ex: number;
  let ez: number;
  if (Math.abs(m13) < 0.9999999) {
    ex = Math.atan2(-m23, m33);
    ez = Math.atan2(-m12, m11);
  } else {
    ex = Math.atan2(m32, m22);
    ez = 0;
  }
  return [ex, ey, out * ez];
}

/**
 * Berechnet eine realistische Sitzhaltung samt Hand-IK-Zielen aus 4 Boden- und 3 Kanten-Varianten.
 * Alle Knochenrotationen werden für die Ausrichtung des Rigs (`leftArm`) normalisiert.
 */
export function computeSitPose(
  leftArm: number,
  legs: LegLengths | null,
  hipToAnkleDrop: number,
  seatPose: SeatPose,
  t = 0,
): SitPoseSpec {
  const out = Math.sign(leftArm) || 1;
  const rigLegs = legs ?? DEFAULT_LEG_LENGTHS;
  const span = rigLegs.thigh + rigLegs.shin;
  const breath = Math.sin(t * 1.8);
  const swayX = drift(t, 1.3);
  const swayY = drift(t, 4.7);
  const pose: BodyPose = {};

  let leftHand: SitHandPlacement;
  let rightHand: SitHandPlacement;

  if (seatPose === 'dangle' || seatPose === 'crossed' || seatPose === 'lean') {
    const legSwing = Math.sin(t * 2.1);
    const doubleBob = Math.sin(t * 1.7);
    const leanForward = seatPose === 'lean' ? 0.14 : seatPose === 'crossed' ? 0.04 : 0.07;
    const edgeNeck = seatPose === 'lean' ? -0.1 : seatPose === 'crossed' ? -0.04 : -0.06;

    pose.hips = [0, swayX * 0.025, swayY * 0.015];
    pose.spine = [leanForward + breath * 0.012, swayX * 0.03, -swayY * 0.012];
    pose.chest = [(seatPose === 'lean' ? 0.06 : 0.03) + breath * 0.015, swayX * 0.03, 0];
    pose.upperChest = [0.02 + Math.sin(t * 1.8 - 0.2) * 0.01, 0, 0];
    pose.neck = [edgeNeck + swayY * 0.03 - breath * 0.008, swayX * 0.05, out * swayY * 0.03];

    if (seatPose === 'dangle') {
      const kneeL = EDGE_SIT_LEGS.bend + 0.14 * legSwing;
      const kneeR = EDGE_SIT_LEGS.bend - 0.14 * legSwing;
      pose.leftUpperLeg = [-EDGE_SIT_LEGS.flex, 0.02 * swayX, -out * 0.04];
      pose.leftLowerLeg = [kneeL, 0, 0];
      pose.leftFoot = [0.18 + 0.1 * legSwing, 0, 0];
      pose.leftToes = [0.06, 0, 0];
      pose.rightUpperLeg = [-EDGE_SIT_LEGS.flex, -0.02 * swayX, out * 0.04];
      pose.rightLowerLeg = [kneeR, 0, 0];
      pose.rightFoot = [0.18 - 0.1 * legSwing, 0, 0];
      pose.rightToes = [0.06, 0, 0];
      leftHand = { alongLeg: 0.65, forwardOffset: 0, upOffset: 0.035, sideOffset: 0.015 };
      rightHand = { alongLeg: 0.65, forwardOffset: 0, upOffset: 0.035, sideOffset: 0.015 };
    } else if (seatPose === 'crossed') {
      pose.leftUpperLeg = legEulerXYZ(1.52, -0.06, 0.16, out);
      pose.leftLowerLeg = [1.32 + 0.04 * doubleBob, 0, 0];
      pose.leftFoot = [0.22 + 0.05 * doubleBob, -0.05, 0];
      pose.leftToes = [0.08, 0, 0];
      pose.rightUpperLeg = legEulerXYZ(1.62, 0.06, -0.16, out);
      pose.rightLowerLeg = [1.46 + 0.04 * doubleBob, 0, 0];
      pose.rightFoot = [0.22 + 0.05 * doubleBob, 0.05, 0];
      pose.rightToes = [0.08, 0, 0];
      leftHand = { alongLeg: 0.45, forwardOffset: 0.01, upOffset: 0.04, sideOffset: -0.05 };
      rightHand = { alongLeg: 0.48, forwardOffset: 0.02, upOffset: 0.045, sideOffset: -0.05 };
    } else {
      // 'lean': neugierig leicht nach vorn gebeugt, Beine schwingen sanft synchron/leicht versetzt
      pose.leftUpperLeg = [-EDGE_SIT_LEGS.flex - 0.04, 0.02, -out * 0.05];
      pose.leftLowerLeg = [EDGE_SIT_LEGS.bend + 0.08 * legSwing, 0, 0];
      pose.leftFoot = [0.16 + 0.06 * legSwing, 0, 0];
      pose.leftToes = [0.05, 0, 0];
      pose.rightUpperLeg = [-EDGE_SIT_LEGS.flex - 0.04, -0.02, out * 0.05];
      pose.rightLowerLeg = [EDGE_SIT_LEGS.bend - 0.06 * legSwing, 0, 0];
      pose.rightFoot = [0.16 - 0.05 * legSwing, 0, 0];
      pose.rightToes = [0.05, 0, 0];
      leftHand = { alongLeg: 0.88, forwardOffset: 0.01, upOffset: 0.035, sideOffset: 0.02 };
      rightHand = { alongLeg: 0.88, forwardOffset: 0.01, upOffset: 0.035, sideOffset: 0.02 };
    }
  } else if (seatPose === 'sideSit') {
    // Seitensitz / Mermaid: beide Beine sanft zur rechten Seite eingeschlagen, Oberkörper leicht gegenläufig aufrecht
    pose.hips = [0, 0.08 + swayX * 0.02, out * (-0.04 + swayY * 0.015)];
    pose.spine = [0.1 + breath * 0.012, -0.06 + swayX * 0.03, out * (0.06 - swayY * 0.015)];
    pose.chest = [0.05 + breath * 0.015, -0.04 + swayX * 0.03, out * 0.04];
    pose.upperChest = [0.02 + Math.sin(t * 1.8 - 0.2) * 0.01, 0, 0];
    pose.neck = [-0.08 + swayY * 0.03 - breath * 0.008, swayX * 0.05, out * (0.04 + swayY * 0.03)];

    pose.leftUpperLeg = legEulerXYZ(1.76, -0.1, 1.42, out);
    pose.leftLowerLeg = [2.05, 0, 0];
    pose.leftFoot = [0.18, -0.12, 0];
    pose.leftToes = [0.08, 0, 0];
    pose.rightUpperLeg = legEulerXYZ(1.72, -0.24, 1.45, out);
    pose.rightLowerLeg = [2.08, 0, 0];
    pose.rightFoot = [0.16, -0.1, 0];
    pose.rightToes = [0.08, 0, 0];

    leftHand = { alongLeg: 0.92, forwardOffset: 0.02, upOffset: 0.035, sideOffset: -0.03 };
    rightHand = { alongLeg: 0.15, forwardOffset: -0.02, upOffset: -0.02, sideOffset: 0.14 };
  } else if (seatPose === 'relaxedLegs') {
    // Asymmetrischer entspannter Bodensitz: linkes Bein angezogen, rechtes entspannt vorgeschoben
    const bent = legReach(rigLegs, 0.45 * span, hipToAnkleDrop);
    const ext = legReach(rigLegs, 0.72 * span, hipToAnkleDrop);

    pose.hips = [0, 0.05 + swayX * 0.025, out * (0.025 + swayY * 0.012)];
    pose.spine = [0.15 + breath * 0.012, -0.03 + swayX * 0.03, -out * 0.02];
    pose.chest = [0.06 + breath * 0.015, swayX * 0.03, -out * 0.01];
    pose.upperChest = [0.025 + Math.sin(t * 1.8 - 0.2) * 0.01, 0, 0];
    pose.neck = [-0.14 + swayY * 0.03 - breath * 0.008, swayX * 0.05, -out * (0.04 - swayY * 0.03)];

    pose.leftUpperLeg = [-bent.flex, 0.05, -out * 0.02];
    pose.leftLowerLeg = [bent.bend, 0, 0];
    pose.leftFoot = [bent.flex - bent.bend, 0.05, 0];
    pose.leftToes = [0.06, 0, 0];

    pose.rightUpperLeg = [-ext.flex, -0.14, out * 0.08];
    pose.rightLowerLeg = [ext.bend, 0, 0];
    pose.rightFoot = [ext.flex - ext.bend + 0.08, -0.08, 0];
    pose.rightToes = [0.08, 0, 0];

    leftHand = { alongLeg: 0.95, forwardOffset: 0.01, upOffset: 0.035, sideOffset: -0.01 };
    rightHand = { alongLeg: 0.55, forwardOffset: 0.01, upOffset: 0.03, sideOffset: -0.02 };
  } else if (seatPose === 'crissCross') {
    // Moderater Schneidersitz: Knie dezent geöffnet, Schienbeine sauber gekreuzt, gerade Haltung
    pose.hips = [0, swayX * 0.025, swayY * 0.012];
    pose.spine = [0.11 + breath * 0.012, swayX * 0.03, -swayY * 0.01];
    pose.chest = [0.05 + breath * 0.015, swayX * 0.03, 0];
    pose.upperChest = [0.02 + Math.sin(t * 1.8 - 0.2) * 0.01, 0, 0];
    pose.neck = [-0.1 + swayY * 0.03 - breath * 0.008, swayX * 0.05, out * swayY * 0.03];

    pose.leftUpperLeg = legEulerXYZ(1.7, 0.36, 1.42, out);
    pose.leftLowerLeg = [2.08, 0, 0];
    pose.leftFoot = [0.14, -0.15, 0];
    pose.leftToes = [0.06, 0, 0];

    pose.rightUpperLeg = legEulerXYZ(1.66, -0.34, -1.46, out);
    pose.rightLowerLeg = [2.15, 0, 0];
    pose.rightFoot = [0.14, 0.15, 0];
    pose.rightToes = [0.06, 0, 0];

    leftHand = { alongLeg: 0.88, forwardOffset: 0.015, upOffset: 0.035, sideOffset: -0.025 };
    rightHand = { alongLeg: 0.88, forwardOffset: 0.015, upOffset: 0.035, sideOffset: -0.025 };
  } else {
    // 'hugKnees': kompakte Knie-Umfassung mit leichter Asymmetrie für lebendige Silhouette
    const leftLeg = legReach(rigLegs, 0.47 * span, hipToAnkleDrop);
    const rightLeg = legReach(rigLegs, 0.49 * span, hipToAnkleDrop);

    pose.hips = [0, swayX * 0.02, swayY * 0.012];
    pose.spine = [0.21 + breath * 0.012, swayX * 0.025, -swayY * 0.01];
    pose.chest = [0.1 + breath * 0.015, swayX * 0.025, 0];
    pose.upperChest = [0.03 + Math.sin(t * 1.8 - 0.2) * 0.01, 0, 0];
    pose.neck = [-0.19 + swayY * 0.03 - breath * 0.008, swayX * 0.04, out * (0.03 + swayY * 0.025)];

    pose.leftUpperLeg = [-leftLeg.flex, 0.04, -out * 0.04];
    pose.leftLowerLeg = [leftLeg.bend, 0, 0];
    pose.leftFoot = [leftLeg.flex - leftLeg.bend, 0, 0];
    pose.leftToes = [0.04, 0, 0];

    pose.rightUpperLeg = [-rightLeg.flex, -0.03, out * 0.045];
    pose.rightLowerLeg = [rightLeg.bend, 0, 0];
    pose.rightFoot = [rightLeg.flex - rightLeg.bend, 0, 0];
    pose.rightToes = [0.04, 0, 0];

    leftHand = { alongLeg: 1.28, forwardOffset: 0.04, upOffset: 0.01, sideOffset: -0.02 };
    rightHand = { alongLeg: 1.34, forwardOffset: 0.04, upOffset: -0.005, sideOffset: -0.02 };
  }

  // Ausgangswinkel für Arme + lebendige Schultern/Handgelenke/Finger (reachWithArm feinjustiert danach Ober-/Unterarm).
  const isEdge = seatPose === 'dangle' || seatPose === 'crossed' || seatPose === 'lean';
  const armsForward = isEdge ? -0.45 : -0.78;
  const elbow = isEdge ? 0.7 : 1.05;
  pose.leftShoulder = [0, 0, -out * (0.03 + breath * 0.01)];
  pose.rightShoulder = [0, 0, out * (0.03 + breath * 0.01)];
  pose.leftUpperArm = [armsForward, 0, -out * 1.24];
  pose.leftLowerArm = [0, -elbow, 0];
  pose.leftHand = [0.05 * drift(t, 2.1), -0.08, -out * 0.05];
  pose.rightUpperArm = [armsForward, 0, out * 1.24];
  pose.rightLowerArm = [0, elbow, 0];
  pose.rightHand = [0.05 * drift(t, 3.8), 0.08, out * 0.05];
  applyRelaxedFingers(pose, 'left', out, t, 0.5, breath, 0.85);
  applyRelaxedFingers(pose, 'right', -out, t, 2.4, breath, 0.85);

  return { pose: forFacing(pose, out), leftHand, rightHand };
}

/**
 * Sitting, knees closed. On the ground the knees are drawn up with the arms around them (a calm
 * pose that keeps the lap covered and stays compact); on an edge the legs hang down and the
 * hands rest on the thighs. `legs` gives the leg angles (`legReach` with the model's own
 * lengths); the foot stays level with the ground or hangs relaxed. `leftArm` is the rig's X
 * direction (VRM 0.x may flip it), which sets where "inwards" and "forwards" are.
 */
export function floorSitPose(leftArm: number, legs: LegAngles = DEFAULT_SIT_LEGS, edge = false, breath = 0): BodyPose {
  const out = Math.sign(leftArm) || 1;
  const thigh = -legs.flex;
  const knee = legs.bend;
  // On the ground the soles stay flat; hanging feet rest lightly so toes don't dip past the window edge.
  const foot = edge ? 0.18 : legs.flex - legs.bend;
  const armsForward = edge ? -0.45 : -0.8;
  const elbow = edge ? 0.7 : 1.1;
  const pose: BodyPose = {
    spine: [(edge ? 0.08 : 0.22) + breath * 0.012, 0, 0],
    chest: [(edge ? 0.04 : 0.1) + breath * 0.015, 0, 0],
    neck: [(edge ? -0.06 : -0.2) - breath * 0.008, 0, 0],
    leftUpperLeg: [thigh, 0, -out * 0.04],
    leftLowerLeg: [knee, 0, 0],
    leftFoot: [foot, 0, 0],
    rightUpperLeg: [thigh, 0, out * 0.04],
    rightLowerLeg: [knee, 0, 0],
    rightFoot: [foot, 0, 0],
    leftUpperArm: [armsForward, 0, -out * 1.25],
    // Elbows bend forwards: a turn about the vertical axis, the same on both kinds of rig.
    leftLowerArm: [0, -elbow, 0],
    leftHand: [0, 0, 0],
    rightUpperArm: [armsForward, 0, out * 1.25],
    rightLowerArm: [0, elbow, 0],
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
