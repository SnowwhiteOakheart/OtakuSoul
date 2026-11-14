import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { reachWithArm } from './armReach';
import { forFacing, type BodyPose } from './proceduralBody';
import { RECOVER_PHASES, type Hang, type HangPoint, type Recover } from './hangTimeline';

/**
 * Desktop pet (VRM): hanging from where the user grabbed it and getting up after a hard landing.
 *
 * The body turns as a whole about the grabbed part (the model's scene, in world space, so VRM
 * 0.x and 1.0 rigs turn alike): upright from the shoulders, head down from the feet, folded over
 * the hand from the hips. Arms and free legs hang straight down in the world (`reachWithArm`),
 * so they stay limp however the body swings. The swing is a damped pendulum pushed by the
 * window's acceleration (like the hip lean of desktop mascots, but about the grip).
 *
 * After landing it keeps how it fell, the lowest body point on the floor; then it tips or plops
 * into sitting (the viewer's floor seat), rubs its head or back with one hand and stands up.
 */

/** Folded over the hand: the pelvis tips forwards this far (radians), the spine bends the rest. */
const HIP_PITCH = 1.25;
/** Pendulum while hanging: stiffness and damping (about 1.5 swings per second, slowly fading). */
const SWING_STIFFNESS = 90;
const SWING_DAMPING = 4.5;
/** How much the window's acceleration (window heights/s²) pushes the swing. */
const SWING_PUSH = 0.1;
/** The swing never goes further than this from hanging still (radians). */
const SWING_LIMIT = 1;
/** Tipping over into sitting after the landing: a quick, barely overshooting turn. */
const TIP_STIFFNESS = 45;
const TIP_DAMPING = 11;
/** The first moments after grabbing it struggles (kicks its legs), later it only dangles. */
const STRUGGLE_S = 1.6;
/** A skirt keeps falling about the legs, not over the head (spring joints by these names). */
const SKIRT = /skirt|スカート|dress|apron|coat|cloth/i;

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Whether a spring joint belongs to a skirt or dress (stays hanging along the legs). */
export const isSkirtJoint = (name: string) => SKIRT.test(name);

/** 0 before `from`, 1 after `to`, smooth in between. */
const ramp = (t: number, from: number, to: number) => {
  const x = Math.min(1, Math.max(0, (t - from) / Math.max(1e-3, to - from)));
  return x * x * (3 - 2 * x);
};

interface Grabbed {
  hang: Hang;
  pivot: VRMHumanBoneName;
  /** The leg held by the feet ('left'/'right'), else null. */
  heldLeg: 'left' | 'right' | null;
  /** Turn on the screen that brings the body under the grip. */
  roll: number;
  at: number;
}

export class HangRig {
  private roll = 0;
  private rollSpeed = 0;
  private pitch = 0;
  private pitchSpeed = 0;
  /** Share of the hanging pose on the bones (eased in and out). */
  private weight = 0;
  private readonly offset = new THREE.Vector3();
  private hang: Hang | null = null;
  private grabbed: Grabbed | null = null;
  private recover: (Recover & { start: number; tipTo: number; rubSide: 'left' | 'right' }) | null = null;
  private lastRecoverId = -1;
  private lastSpeed = 0;
  private readonly restPosition: THREE.Vector3;
  private readonly restTurn: THREE.Quaternion;
  private readonly armLength: number;
  private readonly legLength: number;
  /** The body's current turn in the world (identity when standing): skirts' gravity turns with it. */
  readonly turn = new THREE.Quaternion();
  // Scratch values.
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly f = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly saved = [new THREE.Quaternion(), new THREE.Quaternion()];

  constructor(
    private readonly vrm: VRM,
    private readonly camera: THREE.Camera,
    /** Model height (world units) and the rig's arm direction (`leftArmDirection`, see `forFacing`). */
    private readonly height: number,
    private readonly leftArm: number,
  ) {
    this.restPosition = vrm.scene.position.clone();
    this.restTurn = vrm.scene.quaternion.clone();
    vrm.scene.updateMatrixWorld(true);
    const length = (...names: VRMHumanBoneName[]) => {
      let sum = 0;
      for (let i = 1; i < names.length; i++) {
        const from = this.bone(names[i - 1]!);
        const to = this.bone(names[i]!);
        if (from && to) sum += from.getWorldPosition(this.a).distanceTo(to.getWorldPosition(this.b));
      }
      return sum;
    };
    this.armLength = length('leftUpperArm', 'leftLowerArm', 'leftHand') || 0.45 * height;
    this.legLength = length('leftUpperLeg', 'leftLowerLeg', 'leftFoot') || 0.5 * height;
  }

  private bone(name: VRMHumanBoneName) {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  /** Takes the props of this frame: a new grab, a new landing. */
  sync(hang: Hang | null, recover: Recover | null, elapsed: number) {
    if (hang !== this.hang) {
      this.hang = hang;
      if (hang) {
        this.recover = null;
        this.grabbed = this.pick(hang, elapsed);
      }
    }
    if (recover && recover.id !== this.lastRecoverId) {
      this.lastRecoverId = recover.id;
      // Tips over the way it already leans: from head down a half turn further round.
      const flipped = Math.abs(this.roll) > Math.PI / 2;
      const tipTo = flipped ? Math.sign(this.roll) * 2 * Math.PI : 0;
      this.recover = { ...recover, start: elapsed, tipTo, rubSide: this.grabbed?.heldLeg ?? 'right' };
    }
    if (this.recover && elapsed - this.recover.start > RECOVER_PHASES[this.recover.kind].total) this.recover = null;
  }

  /** Getting up sits on the ground for a while (the viewer's floor seat). */
  seat(elapsed: number): 'floor' | null {
    const recover = this.recover;
    if (!recover || recover.kind === 'feet') return null;
    const t = elapsed - recover.start;
    const phases = RECOVER_PHASES[recover.kind];
    return t >= phases.impact && t < phases.rub ? 'floor' : null;
  }

  /** Back to standing as loaded (the cached model is shown again later). */
  reset() {
    this.vrm.scene.position.copy(this.restPosition);
    this.vrm.scene.quaternion.copy(this.restTurn);
    this.turn.identity();
  }

  /**
   * Which body part is under the pointer (projected bones, the rest pose turned as now) and how
   * far the body must turn to hang below it.
   */
  private pick(hang: Hang, elapsed: number): Grabbed {
    const scene = this.vrm.scene;
    this.camera.updateMatrixWorld();
    const keepPosition = scene.position.clone();
    const keepTurn = scene.quaternion.clone();
    scene.position.copy(this.restPosition);
    scene.quaternion.copy(this.restTurn);
    scene.updateMatrixWorld(true);
    const candidates: VRMHumanBoneName[] =
      hang.grip === 'shoulder' ? ['neck', 'leftUpperArm', 'rightUpperArm'] : hang.grip === 'hip' ? ['hips'] : ['leftFoot', 'rightFoot'];
    let pivot = candidates[0]!;
    let nearest = Infinity;
    for (const name of candidates) {
      const node = this.bone(name);
      if (!node) continue;
      const p = node.getWorldPosition(this.a).project(this.camera);
      const distance = Math.hypot((p.x + 1) / 2 - hang.at.x, (1 - p.y) / 2 - hang.at.y);
      if (distance < nearest) {
        nearest = distance;
        pivot = name;
      }
    }
    // The body's middle, seen from the camera: the turn brings it straight below the grip.
    let roll = 0;
    const pivotNode = this.bone(pivot);
    const hips = this.bone('hips');
    const chest = this.bone('chest') ?? this.bone('spine');
    if (hang.grip !== 'hip' && pivotNode && hips && chest) {
      const middle = hips.getWorldPosition(this.a).add(chest.getWorldPosition(this.b)).multiplyScalar(0.5);
      middle.applyMatrix4(this.camera.matrixWorldInverse);
      const grip = pivotNode.getWorldPosition(this.c).applyMatrix4(this.camera.matrixWorldInverse);
      roll = -Math.atan2(middle.x - grip.x, grip.y - middle.y);
    }
    scene.position.copy(keepPosition);
    scene.quaternion.copy(keepTurn);
    scene.updateMatrixWorld(true);
    const heldLeg = pivot === 'leftFoot' ? 'left' : pivot === 'rightFoot' ? 'right' : null;
    return { hang, pivot, heldLeg, roll, at: elapsed };
  }

  /** The point of the viewer at `point` (shares) on the plane through the figure, facing the camera. */
  private anchorInWorld(point: HangPoint, out: THREE.Vector3) {
    const camera = this.camera;
    const origin = camera.getWorldPosition(this.d);
    const ray = out.set(point.x * 2 - 1, 1 - point.y * 2, 0.5).unproject(camera).sub(origin).normalize();
    const normal = camera.getWorldDirection(this.e);
    const along = this.f.copy(this.restPosition).addScaledVector(UP, this.height * 0.5).sub(origin).dot(normal);
    return out.multiplyScalar(along / Math.max(1e-6, ray.dot(normal))).add(origin);
  }

  /** The lowest point of the body (world y): soles, head top, hands, knees, hips. */
  private lowest() {
    const up = this.a.copy(UP).applyQuaternion(this.turn);
    let lowest = Infinity;
    const at = (name: VRMHumanBoneName, along = 0) => {
      const node = this.bone(name);
      if (!node) return;
      const y = node.getWorldPosition(this.b).addScaledVector(up, along).y;
      if (y < lowest) lowest = y;
    };
    at('head', 0.12 * this.height);
    at('hips', -0.05 * this.height);
    for (const side of ['left', 'right'] as const) {
      at(`${side}Hand`);
      at(`${side}LowerArm`);
      at(`${side}LowerLeg`);
      at(`${side}Foot`, -0.04 * this.height);
    }
    return lowest === Infinity ? 0 : lowest;
  }

  /**
   * Bones of a pose (rig angles as in `proceduralBody`), mixed in by `weight`. Along the spine
   * a negative X bends forwards (checked rendered with VRM 0.x and 1.0).
   */
  private pose(pose: BodyPose & Partial<Record<'head', [number, number, number]>>, weight: number) {
    const head = pose.head;
    delete pose.head;
    const turned = forFacing(pose as BodyPose, this.leftArm) as Record<string, [number, number, number]>;
    if (head) turned.head = this.leftArm >= 0 ? head : [-head[0], head[1], head[2]];
    for (const [name, [x, y, z]] of Object.entries(turned)) {
      const node = this.bone(name as VRMHumanBoneName);
      if (!node) continue;
      node.quaternion.slerp(this.q.setFromEuler(this.euler.set(x, y, z)), weight);
    }
  }

  /** Turns a limb (upper, lower, end) so its end hangs at `target`, mixed in by `weight`. */
  private reach(side: 'left' | 'right', limb: 'Arm' | 'Leg', target: THREE.Vector3, weight: number) {
    const upper = this.bone(`${side}Upper${limb}` as VRMHumanBoneName);
    const lower = this.bone(`${side}Lower${limb}` as VRMHumanBoneName);
    const end = this.bone((limb === 'Arm' ? `${side}Hand` : `${side}Foot`) as VRMHumanBoneName);
    if (!upper || !lower || !end || weight <= 0.001) return;
    const [keepUpper, keepLower] = this.saved as [THREE.Quaternion, THREE.Quaternion];
    keepUpper.copy(upper.quaternion);
    keepLower.copy(lower.quaternion);
    reachWithArm(upper, lower, end, target);
    upper.quaternion.copy(keepUpper.slerp(upper.quaternion, weight));
    lower.quaternion.copy(keepLower.slerp(lower.quaternion, weight));
    upper.updateWorldMatrix(false, true);
  }

  /**
   * Applies hanging and getting up over the pose so far (motion, procedural body, seat). `swayX`
   * is the window's sideways speed (window heights per second, from `BodySway`).
   */
  apply(delta: number, elapsed: number, swayX: number) {
    const dt = Math.min(0.05, Math.max(1e-3, delta));
    const hang = this.hang;
    const grabbed = this.grabbed;
    const recover = this.recover;
    const t = recover ? elapsed - recover.start : 0;
    const phases = recover ? RECOVER_PHASES[recover.kind] : null;
    // Lying as it fell until the impact is over; then tipping into the seat.
    const lying = !!recover && !!phases && t < phases.impact;

    let rollTarget = 0;
    let pitchTarget = 0;
    let weightTarget = 0;
    if (hang && grabbed) {
      rollTarget = grabbed.roll;
      pitchTarget = hang.grip === 'hip' ? HIP_PITCH : 0;
      weightTarget = 1;
    } else if (lying && grabbed) {
      rollTarget = this.roll;
      pitchTarget = this.pitch;
      weightTarget = 1;
    } else if (recover) {
      rollTarget = recover.tipTo;
    }

    const accel = THREE.MathUtils.clamp((swayX - this.lastSpeed) / dt, -80, 80);
    this.lastSpeed = swayX;
    // Far from hanging still (just grabbed, turning head down) it turns over calmly; near it, it swings.
    const settling = Math.abs(rollTarget - this.roll) > 0.6;
    const [stiffness, damping] = hang && !settling ? [SWING_STIFFNESS, SWING_DAMPING] : [TIP_STIFFNESS, TIP_DAMPING];
    // A push to the right swings the hanging body out to the left (clockwise on the screen).
    const push = hang ? -accel * SWING_PUSH : 0;
    this.rollSpeed += (stiffness * (rollTarget - this.roll) - damping * this.rollSpeed + push) * dt;
    this.roll += this.rollSpeed * dt;
    if (hang && !settling) this.roll = THREE.MathUtils.clamp(this.roll, rollTarget - SWING_LIMIT, rollTarget + SWING_LIMIT);
    this.pitchSpeed += (TIP_STIFFNESS * (pitchTarget - this.pitch) - TIP_DAMPING * this.pitchSpeed) * dt;
    this.pitch += this.pitchSpeed * dt;
    // Tipped a whole turn round: that is upright again.
    if (!hang && recover && recover.tipTo !== 0 && Math.abs(this.roll - recover.tipTo) < 0.01 && Math.abs(this.rollSpeed) < 0.05) {
      this.roll -= recover.tipTo;
      recover.tipTo = 0;
    }
    const rate = weightTarget > this.weight ? 10 : 5;
    this.weight += (weightTarget - this.weight) * Math.min(1, dt * rate);

    const scene = this.vrm.scene;
    const still =
      !recover &&
      !hang &&
      this.weight < 0.001 &&
      Math.abs(this.roll) < 1e-3 &&
      Math.abs(this.pitch) < 1e-3 &&
      this.offset.lengthSq() < 1e-8;
    if (still) {
      if (this.roll !== 0 || this.pitch !== 0) this.roll = this.pitch = this.rollSpeed = this.pitchSpeed = 0;
      this.offset.set(0, 0, 0);
      this.reset();
      return;
    }

    // 1. The body's own pose while hanging (and lying as it fell).
    const kind = (hang ?? grabbed?.hang)?.grip;
    if (this.weight > 0.001 && kind) {
      if (kind === 'shoulder') {
        this.pose({ spine: [-0.05, 0, 0], neck: [-0.22, 0, 0], leftFoot: [0.45, 0, 0], rightFoot: [0.45, 0, 0] }, this.weight);
      } else if (kind === 'hip') {
        this.pose(
          {
            spine: [-0.35, 0, 0],
            chest: [-0.3, 0, 0],
            upperChest: [-0.2, 0, 0],
            neck: [-0.3, 0, 0],
            head: [-0.15, 0, 0],
            leftFoot: [0.4, 0, 0],
            rightFoot: [0.4, 0, 0],
          },
          this.weight,
        );
      } else {
        const held = grabbed?.heldLeg ?? 'left';
        this.pose(
          {
            spine: [0.08, 0, 0],
            neck: [0.25, 0, 0],
            [`${held}UpperLeg` as const]: [0, 0, 0],
            [`${held}LowerLeg` as const]: [0, 0, 0],
            [`${held}Foot` as const]: [0.3, 0, 0],
          } as BodyPose,
          this.weight,
        );
      }
    }
    // Landing on the feet: a deep crouch that springs back.
    const hips = this.bone('hips');
    if (recover?.kind === 'feet' && phases) {
      const down = t < phases.impact ? ramp(t, 0, phases.impact) : 1 - ramp(t, phases.impact, phases.total);
      this.pose(
        {
          spine: [-0.3 * down, 0, 0],
          leftUpperLeg: [-1.0 * down, 0, 0],
          rightUpperLeg: [-1.0 * down, 0, 0],
          leftLowerLeg: [1.8 * down, 0, 0],
          rightLowerLeg: [1.8 * down, 0, 0],
          leftFoot: [-0.8 * down, 0, 0],
          rightFoot: [-0.8 * down, 0, 0],
        },
        down,
      );
      if (hips) hips.position.y -= 0.16 * this.height * down;
    }

    // 2. The whole body turned: on the screen (roll about the view axis), forwards over the hand (pitch).
    const towardsCamera = this.camera.getWorldDirection(this.a).negate();
    // Forwards is a turn about -X: the figure faces the camera (+Z), its top goes towards it.
    this.turn.setFromAxisAngle(towardsCamera, this.roll).multiply(this.q.setFromAxisAngle(AXIS_X, -this.pitch));
    scene.quaternion.copy(this.turn).multiply(this.restTurn);
    scene.position.copy(this.restPosition);
    scene.updateMatrixWorld(true);

    // 3. Where it is: the grabbed part under the pointer; after the landing its lowest point on the floor.
    if (hang && grabbed) {
      const pivot = this.bone(grabbed.pivot);
      if (pivot) {
        const wanted = this.anchorInWorld(hang.anchor, this.c).sub(pivot.getWorldPosition(this.b));
        this.offset.lerp(wanted, Math.min(1, dt * 14));
      }
    } else if (recover) {
      this.offset.x += (0 - this.offset.x) * Math.min(1, dt * 6);
      this.offset.z += (0 - this.offset.z) * Math.min(1, dt * 6);
      // Falls the rest of the way at once (gravity), rises gently (standing up lifts the seat).
      const floor = -(this.lowest() - this.restPosition.y);
      const gap = floor - this.offset.y;
      this.offset.y += gap * Math.min(1, dt * (gap < 0 ? 25 : 8));
    } else {
      this.offset.lerp(this.b.set(0, 0, 0), Math.min(1, dt * 6));
    }
    scene.position.copy(this.restPosition).add(this.offset);
    scene.updateMatrixWorld(true);

    // 4. Limp limbs hang straight down; held by the shoulders the legs kick at first.
    if (this.weight > 0.001 && kind) {
      const struggle = hang && grabbed ? 1 - ramp(elapsed - grabbed.at, STRUGGLE_S * 0.6, STRUGGLE_S) : 0;
      const front = this.c.set(0, 0, 1).applyQuaternion(this.turn);
      for (const side of ['left', 'right'] as const) {
        const shoulder = this.bone(`${side}UpperArm`);
        if (shoulder) {
          const sway = 0.04 * Math.sin(elapsed * 1.7 + (side === 'left' ? 0 : 2));
          const target = shoulder
            .getWorldPosition(this.a)
            .addScaledVector(DOWN, this.armLength * 0.97)
            .addScaledVector(front, this.armLength * sway);
          this.reach(side, 'Arm', target, this.weight);
        }
        const hip = this.bone(`${side}UpperLeg`);
        if (!hip || grabbed?.heldLeg === side) continue;
        const target = hip.getWorldPosition(this.a);
        if (kind === 'feet') {
          // The free leg sinks towards the floor, a little aside and forwards, the knee bent.
          const held = this.bone(`${grabbed?.heldLeg ?? 'left'}UpperLeg`);
          const away = held ? this.b.subVectors(target, held.getWorldPosition(this.b)).setY(0).normalize() : this.b.set(0, 0, 0);
          const drop = this.d.copy(DOWN).addScaledVector(away, 0.3).addScaledVector(front, 0.35).normalize();
          target.addScaledVector(drop, this.legLength * 0.8);
        } else {
          const kick = struggle * 0.22 * Math.sin(elapsed * 9 + (side === 'left' ? 0 : Math.PI));
          target.addScaledVector(DOWN, this.legLength * (0.96 - Math.abs(kick) * 0.3)).addScaledVector(front, this.legLength * kick);
        }
        this.reach(side, 'Leg', target, this.weight);
      }
    }

    // 5. Sitting after the landing: one hand rubs the head (or the lower back).
    if (recover && phases && recover.kind !== 'feet') {
      const rub = ramp(t, phases.settle - 0.2, phases.settle + 0.3) * (1 - ramp(t, phases.rub - 0.4, phases.rub));
      const side = recover.rubSide;
      if (rub > 0.001) {
        const up = this.a.copy(UP).applyQuaternion(this.turn);
        const front = this.b.set(0, 0, 1).applyQuaternion(this.turn);
        const shoulder = this.bone(`${side}UpperArm`);
        const other = this.bone(`${side === 'left' ? 'right' : 'left'}UpperArm`);
        const head = this.bone('head');
        if (shoulder && other && head && hips) {
          const outwards = this.c.subVectors(shoulder.getWorldPosition(this.c), other.getWorldPosition(this.d)).normalize();
          const circle = elapsed * 9;
          const target =
            recover.kind === 'head'
              ? head.getWorldPosition(this.e).addScaledVector(up, 0.075 * this.height).addScaledVector(outwards, 0.025 * this.height)
              : hips
                  .getWorldPosition(this.e)
                  .addScaledVector(up, 0.1 * this.height)
                  .addScaledVector(front, -0.08 * this.height)
                  .addScaledVector(outwards, 0.04 * this.height);
          target.addScaledVector(front, 0.012 * this.height * Math.cos(circle)).addScaledVector(up, 0.012 * this.height * Math.sin(circle));
          // Head bowed (rubbing it) or the back straightened (rubbing that).
          this.pose(recover.kind === 'head' ? { neck: [-0.3, 0, -0.1], spine: [-0.1, 0, 0] } : { spine: [0.15, 0, 0], neck: [0.1, 0, 0] }, rub);
          scene.updateMatrixWorld(true);
          this.reach(side, 'Arm', target, rub);
        }
      }
    }
  }
}
