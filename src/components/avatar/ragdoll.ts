/**
 * A small ragdoll for the desktop pet's falls (switch `PetPrefs.ragdoll`, VRM only): the body as
 * points joined by sticks, integrated with Verlet steps and solved by relaxation (the usual
 * game-ragdoll method, no physics library). The trunk is rigid, the head nods within limits,
 * hands and feet swing freely within their arm's and leg's reach; elbows and knees follow from
 * them like real hinges (knees bend forwards, elbows backwards). Gravity, the floor with
 * friction, and a bounded depth keep it lying in front of the camera.
 *
 * Pure (no three.js): world units (metres for VRM) and seconds. `HangRig` turns the points into
 * bone turns and hands over to getting up after `RAGDOLL_S` (`hangTimeline.ts`).
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** The simulated points: trunk, head top, shoulders, hip joints, hands and feet. */
export const JOINTS = ['hips', 'chest', 'neck', 'headTop', 'lShoulder', 'rShoulder', 'lHip', 'rHip', 'lHand', 'rHand', 'lFoot', 'rFoot'] as const;
export type JointName = (typeof JOINTS)[number];

const TRUNK: JointName[] = ['hips', 'chest', 'neck', 'lShoulder', 'rShoulder', 'lHip', 'rHip'];

export interface RagdollSetup {
  /** Where the points are now (world). */
  joints: Record<JointName, V3>;
  /** Speed of the whole body at the start (world units/s), e.g. the landing's. */
  velocity: V3;
  /** World height of the floor. */
  floor: number;
  /** The model's height (world units): sizes of the points and the depth bound. */
  height: number;
  /** Upper and lower arm, upper and lower leg (world units). */
  arm: [number, number];
  leg: [number, number];
}

interface Stick {
  a: JointName;
  b: JointName;
  min: number;
  max: number;
}

/** Gravity (m/s²). */
const GRAVITY = 9.81;
/** Fixed step of the simulation (s) and relaxation rounds per step. */
const STEP = 1 / 120;
const ROUNDS = 8;
/** Speed kept per step in the air (a little air resistance). */
const AIR = 0.998;
/** On the floor the sideways speed is kept this much per step (friction), the bounce this much. */
const FLOOR_FRICTION = 0.82;
const BOUNCE = 0.12;
/** Point radius on the floor (share of the model height); the head is larger. */
const RADIUS = 0.025;
const HEAD_RADIUS = 0.07;
/** The body stays this close to its starting depth (share of the height): it lies facing the camera. */
const DEPTH = 0.22;

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3, fallback: V3): V3 => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : fallback;
};
const clone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });

/**
 * The middle joint of two bones of lengths `a` and `b` from `from` to `to`, bent towards `hint`
 * (a direction): knees forwards, elbows backwards.
 */
export function hinge(from: V3, to: V3, a: number, b: number, hint: V3): V3 {
  const span = sub(to, from);
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, length(span)));
  const dir = norm(span, { x: 0, y: -1, z: 0 });
  const along = (a * a - b * b + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, a * a - along * along));
  const side = norm(sub(hint, scale(dir, dot(hint, dir))), { x: 0, y: 0, z: 1 });
  return add(add(from, scale(dir, along)), scale(side, out));
}

export class Ragdoll {
  readonly pos: Record<JointName, V3>;
  private readonly prev: Record<JointName, V3>;
  private readonly sticks: Stick[] = [];
  private readonly depth: number;
  private carry = 0;

  constructor(private readonly setup: RagdollSetup) {
    const at = setup.joints;
    this.pos = Object.fromEntries(JOINTS.map((name) => [name, clone(at[name])])) as Record<JointName, V3>;
    this.prev = Object.fromEntries(
      JOINTS.map((name) => [name, sub(at[name], scale(setup.velocity, STEP))]),
    ) as Record<JointName, V3>;
    this.depth = (at.hips.z + at.chest.z) / 2;
    const fixed = (a: JointName, b: JointName) => {
      const d = length(sub(at[a], at[b]));
      this.sticks.push({ a, b, min: d, max: d });
    };
    // A rigid trunk: every pair of its points keeps its distance.
    for (let i = 0; i < TRUNK.length; i++) for (let j = i + 1; j < TRUNK.length; j++) fixed(TRUNK[i]!, TRUNK[j]!);
    // The head on the neck, nodding only so far towards the chest or away from it.
    fixed('neck', 'headTop');
    const nod = length(sub(at.headTop, at.chest));
    this.sticks.push({ a: 'headTop', b: 'chest', min: nod * 0.82, max: nod * 1.04 });
    // Hands and feet anywhere within reach (the elbow and knee bend in between, not fully).
    const arm = setup.arm[0] + setup.arm[1];
    const leg = setup.leg[0] + setup.leg[1];
    for (const side of ['l', 'r'] as const) {
      this.sticks.push({ a: `${side}Shoulder`, b: `${side}Hand`, min: arm * 0.4, max: arm * 0.995 });
      this.sticks.push({ a: `${side}Hip`, b: `${side}Foot`, min: leg * 0.5, max: leg * 0.995 });
    }
  }

  /** The body's up (hips to neck) and its left (right hip joint to left), unit length. */
  frame(): { up: V3; left: V3; front: V3 } {
    const up = norm(sub(this.pos.neck, this.pos.hips), { x: 0, y: 1, z: 0 });
    const lateral = sub(this.pos.lHip, this.pos.rHip);
    const left = norm(sub(lateral, scale(up, dot(lateral, up))), { x: 1, y: 0, z: 0 });
    return { up, left, front: norm(cross(left, up), { x: 0, y: 0, z: 1 }) };
  }

  /** Knee and elbow of a side, bent like hinges (knees forwards, elbows backwards and a little out). */
  knee(side: 'l' | 'r'): V3 {
    const { front } = this.frame();
    const [upper, lower] = this.setup.leg;
    const knee = hinge(this.pos[`${side}Hip`], this.pos[`${side}Foot`], upper, lower, front);
    return { ...knee, y: Math.max(knee.y, this.setup.floor + RADIUS * this.setup.height) };
  }

  elbow(side: 'l' | 'r'): V3 {
    const { front, left } = this.frame();
    const [upper, lower] = this.setup.arm;
    const out = side === 'l' ? left : scale(left, -1);
    const elbow = hinge(this.pos[`${side}Shoulder`], this.pos[`${side}Hand`], upper, lower, add(scale(front, -1), scale(out, 0.4)));
    return { ...elbow, y: Math.max(elbow.y, this.setup.floor + RADIUS * this.setup.height) };
  }

  /** Advances by `dt` seconds (in fixed steps). */
  step(dt: number) {
    this.carry = Math.min(0.25, this.carry + Math.max(0, dt));
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.integrate();
      for (let i = 0; i < ROUNDS; i++) this.relax();
    }
  }

  private integrate() {
    for (const name of JOINTS) {
      const p = this.pos[name];
      const q = this.prev[name];
      const v = scale(sub(p, q), AIR);
      this.prev[name] = clone(p);
      this.pos[name] = { x: p.x + v.x, y: p.y + v.y - GRAVITY * STEP * STEP, z: p.z + v.z };
    }
  }

  private relax() {
    for (const stick of this.sticks) {
      const a = this.pos[stick.a];
      const b = this.pos[stick.b];
      const span = sub(b, a);
      const d = length(span);
      if (d < 1e-9) continue;
      const goal = Math.min(stick.max, Math.max(stick.min, d));
      if (goal === d) continue;
      const fix = scale(span, ((d - goal) / d) * 0.5);
      this.pos[stick.a] = add(a, fix);
      this.pos[stick.b] = sub(b, fix);
    }
    const { floor, height } = this.setup;
    for (const name of JOINTS) {
      const p = this.pos[name];
      const q = this.prev[name];
      const radius = (name === 'headTop' || name === 'neck' ? HEAD_RADIUS : RADIUS) * height;
      if (p.y < floor + radius) {
        // On the floor: pushed up, a small bounce, friction against sliding.
        const vy = p.y - q.y;
        p.y = floor + radius;
        q.y = p.y + vy * BOUNCE;
        q.x = p.x - (p.x - q.x) * FLOOR_FRICTION;
        q.z = p.z - (p.z - q.z) * FLOOR_FRICTION;
      }
      const limit = DEPTH * height;
      if (Math.abs(p.z - this.depth) > limit) p.z = this.depth + Math.sign(p.z - this.depth) * limit;
    }
  }

  /** How fast the body still moves (world units/s, the fastest point). */
  speed(): number {
    let fastest = 0;
    for (const name of JOINTS) fastest = Math.max(fastest, length(sub(this.pos[name], this.prev[name])) / STEP);
    return fastest;
  }
}
