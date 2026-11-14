import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { reachWithArm } from './armReach';
import { forFacing, type BodyPose } from './proceduralBody';
import { Ragdoll, type JointName, type V3 } from './ragdoll';
import {
  groundAngle,
  kittenKick,
  RAGDOLL_S,
  recoverClock,
  recoverTotal,
  usesRagdoll,
  RECOVER_PHASES,
  recoverLean,
  recoverPush,
  recoverRoll,
  recoverSeat,
  swingStep,
  TOPPLE_KICK,
  wrapAngle,
  type Hang,
  type HangHold,
  type HangPoint,
  type Recover,
  type Swing,
} from './hangTimeline';

/**
 * Desktop pet (VRM): hanging from where the user grabbed it and getting up after a hard landing.
 *
 * The body turns as a whole about the grabbed part (the model's scene, in world space, so VRM
 * 0.x and 1.0 rigs turn alike): upright from the shoulders, head down from the feet, folded over
 * the hand from the hips. Arms and free legs hang straight down in the world (`reachWithArm`),
 * so they stay limp, trailing the body's swing. The swing is a gravity pendulum about the grip,
 * driven by the window's acceleration (the hand moving it), so held by the feet it swings slowly
 * and far, by the collar quick and short.
 *
 * After landing it keeps how it fell, the lowest body point on the floor; then it tips or plops
 * into sitting (the viewer's floor seat), rubs its head or back with one hand and stands up.
 */

/** Folded over the hand: the pelvis tips forwards this far (radians), the spine bends the rest. */
const HIP_PITCH = 1.25;
/** Longest integration step of swing and tipping (s): stable at any frame rate. */
const MAX_STEP = 1 / 60;
/** How fast the trunk follows the swing (1/s): slower bends it more like a whip, the head last. */
const TRUNK_FOLLOW = 6;
/** How far the trailing trunk bends at most (radians, all its joints together). */
const TRUNK_BEND = 0.6;
/** Share of that bend per joint, from the hips up. */
const TRUNK_JOINTS: [VRMHumanBoneName, number][] = [
  ['spine', 0.2],
  ['chest', 0.2],
  ['upperChest', 0.15],
  ['neck', 0.25],
  ['head', 0.2],
];
/** Head down it tries to curl up towards its legs every this many seconds, for about a third of it. */
const CURL_EVERY_S = 4.5;
/** Its struggling tires: after this long it only does a little of it. */
const TIRE_S = 15;
/** How fast arms and legs follow the swinging body (1/s): slower trails behind. */
const LIMB_FOLLOW = 6;
/** Tipping over into sitting after the landing: a quick, barely overshooting turn. */
const TIP_STIFFNESS = 45;
const TIP_DAMPING = 11;
/** The first moments after grabbing it struggles (kicks its legs), later it only dangles. */
const STRUGGLE_S = 1.6;
/** Lying on the floor it is dragged along: its swing loses this share of its speed per second. */
const GROUND_FRICTION = 8;
/** A skirt keeps falling about the legs, not over the head (spring joints by these names). */
const SKIRT = /skirt|スカート|dress|apron|coat|cloth/i;

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** The figure fills about this share of the pet window (`petFigureTop`): window heights to world units. */
const FIGURE_SHARE = 0.78;
/** Bones the ragdoll turns; getting up blends in from their last turns over `DOLL_BLEND_S`. */
const DOLL_BONES: VRMHumanBoneName[] = [
  'hips',
  'neck',
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg',
];
const DOLL_BLEND_S = 0.5;

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
  /** The arm held by its hand, else null. */
  heldArm: 'left' | 'right' | null;
  /** Held by the collar (the neck): it curls up and kicks like a kitten. */
  kitten: boolean;
  /** Turn on the screen that brings the body under the grip. */
  roll: number;
  /** Pendulum length, grip to the body's middle (window heights). */
  length: number;
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
  /** Held by a foot the user drags: where it is and where the floor is (see `HangHold`). */
  private hold: HangHold | null = null;
  private grabbed: Grabbed | null = null;
  /** Getting up: since when, the turn and tilt it landed with, the hand that rubs. */
  private recover: (Recover & { start: number; from: number; pitchFrom: number; rubSide: 'left' | 'right'; springsReset: boolean }) | null = null;
  /** When it last hung (a landing long after that came from standing: no hanging pose to keep). */
  private lastHangAt = Number.NEGATIVE_INFINITY;
  private lastRecoverId = -1;
  private readonly lastSpeed = { x: 0, y: 0 };
  /** Swing of arms and legs about the view axis (radians), trailing the body's. */
  private limbAngle = 0;
  private readonly limbDown = new THREE.Vector3();
  /** Has hung within the swing limit since grabbed (turning head down may go further once). */
  private hanging = false;
  /** How far it curls up right now (head down, 0…1). */
  private curl = 0;
  /** The trunk's own turn, trailing the body's (radians). */
  private trunkRoll = 0;
  private readonly viewAxis = new THREE.Vector3();
  private readonly q3 = new THREE.Quaternion();
  private readonly q4 = new THREE.Quaternion();
  private readonly q5 = new THREE.Quaternion();
  private readonly restPosition: THREE.Vector3;
  private readonly restTurn: THREE.Quaternion;
  private readonly armLength: number;
  private readonly legLength: number;
  /** Upper and lower arm and leg (world units), for the ragdoll's elbows and knees. */
  private readonly armParts: [number, number];
  private readonly legParts: [number, number];
  /** Falling freely as a ragdoll right now (the first `RAGDOLL_S` of getting up). */
  private doll: Ragdoll | null = null;
  /** The ragdoll's last bone turns, and when it handed over: getting up blends in from them. */
  private readonly dollPose = new Map<VRMHumanBoneName, THREE.Quaternion>();
  private dollEndAt: number | null = null;
  private readonly basis = new THREE.Matrix4();
  private readonly q6 = new THREE.Quaternion();
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
    this.armParts = [length('leftUpperArm', 'leftLowerArm') || 0.23 * height, length('leftLowerArm', 'leftHand') || 0.22 * height];
    this.legParts = [length('leftUpperLeg', 'leftLowerLeg') || 0.26 * height, length('leftLowerLeg', 'leftFoot') || 0.24 * height];
  }

  private bone(name: VRMHumanBoneName) {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  /** Takes the props of this frame: a new grab, a new landing. */
  sync(hang: Hang | null, recover: Recover | null, elapsed: number) {
    if (hang) this.lastHangAt = elapsed;
    if (hang !== this.hang) {
      this.hang = hang;
      if (hang) {
        this.recover = null;
        this.grabbed = this.pick(hang, elapsed);
        this.hanging = false;
        this.trunkRoll = this.roll;
        // Grabbed head down from standing: it starts to topple at once (not balanced on the grip).
        const off = wrapAngle(this.roll - this.grabbed.roll);
        if (Math.abs(off) > 2.5) this.rollSpeed = -Math.sign(off) * TOPPLE_KICK;
      }
    }
    if (recover && recover.id !== this.lastRecoverId) {
      this.lastRecoverId = recover.id;
      // Knocked down from standing (not dropped from the hand): no hanging pose to lie in.
      if (elapsed - this.lastHangAt > 0.6) this.grabbed = null;
      this.recover = {
        ...recover,
        start: elapsed,
        from: wrapAngle(this.roll),
        pitchFrom: this.pitch,
        rubSide: this.grabbed?.heldLeg ?? 'right',
        springsReset: false,
      };
      this.dollEndAt = null;
      this.doll = usesRagdoll(recover) ? this.startRagdoll(recover.ragdoll!) : null;
    }
    if (this.recover && elapsed - this.recover.start > recoverTotal(this.recover)) {
      this.recover = null;
      this.doll = null;
    }
  }

  /** The held foot's place and the floor while the user drags it (null: the hang's own anchor). */
  setHold(hold: HangHold | null) {
    this.hold = hold;
  }

  /**
   * Getting up sits on the ground for a while (the viewer's floor seat): how far (0…1), drawn in
   * as it pushes itself up and given up as it stands; null when it is not getting up.
   */
  seatShare(elapsed: number): number | null {
    const recover = this.recover;
    if (!recover) return null;
    return recoverSeat(recover.kind, recoverClock(recover, elapsed - recover.start), usesRagdoll(recover));
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
      hang.grip === 'shoulder'
        ? ['neck', 'leftUpperArm', 'rightUpperArm']
        : hang.grip === 'hip'
          ? ['hips']
          : hang.grip === 'hand'
            ? ['leftHand', 'rightHand']
            : ['leftFoot', 'rightFoot'];
    let pivot = candidates[0]!;
    let nearest = Infinity;
    for (const name of candidates) {
      const node = this.bone(name);
      if (!node) continue;
      const p = node.getWorldPosition(this.a).project(this.camera);
      const distance = Math.hypot((p.x / 2) * this.aspect() - hang.at.x, (1 - p.y) / 2 - hang.at.y);
      if (distance < nearest) {
        nearest = distance;
        pivot = name;
      }
    }
    // By a hand the body turns about that arm's shoulder (the arm stretched up to the hand).
    const heldArm = pivot === 'leftHand' ? 'left' : pivot === 'rightHand' ? 'right' : null;
    if (heldArm) pivot = `${heldArm}UpperArm`;
    // The body's middle, seen from the camera: the turn brings it straight below the grip.
    let roll = 0;
    let length = 0.25;
    const pivotNode = this.bone(pivot);
    const hips = this.bone('hips');
    const chest = this.bone('chest') ?? this.bone('spine');
    if (hang.grip !== 'hip' && pivotNode && hips && chest) {
      const middle = hips.getWorldPosition(this.a).add(chest.getWorldPosition(this.b)).multiplyScalar(0.5);
      middle.applyMatrix4(this.camera.matrixWorldInverse);
      const grip = pivotNode.getWorldPosition(this.c).applyMatrix4(this.camera.matrixWorldInverse);
      roll = -Math.atan2(middle.x - grip.x, grip.y - middle.y);
      length = (middle.distanceTo(grip) / this.height) * 0.8;
      // Hanging from the hand, the arm makes the pendulum longer.
      if (heldArm) length += (this.armLength / this.height) * 0.8;
    }
    scene.position.copy(keepPosition);
    scene.quaternion.copy(keepTurn);
    scene.updateMatrixWorld(true);
    const heldLeg = pivot === 'leftFoot' ? 'left' : pivot === 'rightFoot' ? 'right' : null;
    const kitten = hang.grip === 'shoulder' && pivot === 'neck';
    return { hang, pivot, heldLeg, heldArm, kitten, roll, length: Math.max(0.2, length), at: elapsed };
  }

  /** Width by height of the view (the pet window widens while it hangs). */
  private aspect() {
    return (this.camera as THREE.PerspectiveCamera).aspect || 1;
  }

  /** The point of the viewer at `point` (see `HangPoint`) on the plane through the figure, facing the camera. */
  private anchorInWorld(point: HangPoint, out: THREE.Vector3) {
    const camera = this.camera;
    const origin = camera.getWorldPosition(this.d);
    const ray = out.set((point.x * 2) / this.aspect(), 1 - point.y * 2, 0.5).unproject(camera).sub(origin).normalize();
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
    at('head', -0.06 * this.height);
    at('hips', -0.05 * this.height);
    for (const side of ['left', 'right'] as const) {
      at(`${side}Hand`);
      at(`${side}UpperArm`);
      at(`${side}LowerArm`);
      at(`${side}LowerLeg`);
      at(`${side}Foot`, -0.04 * this.height);
    }
    return lowest === Infinity ? 0 : lowest;
  }

  /**
   * Bones of a pose (rig angles as in `proceduralBody`), mixed in by `weight`. Along the spine
   * a positive X bends forwards (checked rendered from the front with VRM 0.x and 1.0: the head
   * test shows negative X tilts the head back).
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

  /** Turns a bone by a turn given in the world (whatever way the rig's own axes point). */
  private turnInWorld(node: THREE.Object3D, turn: THREE.Quaternion) {
    const parent = node.parent;
    if (parent) parent.getWorldQuaternion(this.q3);
    else this.q3.identity();
    const inParent = this.q5.copy(this.q3).invert().multiply(turn).multiply(this.q3);
    node.quaternion.premultiply(inParent);
    node.updateWorldMatrix(false, true);
  }

  /** Turns `node` so the way to `child` points along `direction` (world). */
  private aim(node: THREE.Object3D | null, child: THREE.Object3D | null, direction: V3) {
    if (!node || !child) return;
    const now = child.getWorldPosition(this.a).sub(node.getWorldPosition(this.b));
    const want = this.c.set(direction.x, direction.y, direction.z);
    if (now.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
    this.turnInWorld(node, this.q6.setFromUnitVectors(now.normalize(), want.normalize()));
  }

  /** The body's points now (world), for a ragdoll to start from. */
  private startRagdoll(speed: { down: number; side: number }): Ragdoll {
    const scene = this.vrm.scene;
    scene.updateMatrixWorld(true);
    const at = (name: VRMHumanBoneName, fallback: VRMHumanBoneName = 'hips'): V3 => {
      const p = (this.bone(name) ?? this.bone(fallback))!.getWorldPosition(new THREE.Vector3());
      return { x: p.x, y: p.y, z: p.z };
    };
    const hips = at('hips');
    const neck = at('neck', 'chest');
    const head = at('head', 'neck');
    const up = new THREE.Vector3(neck.x - hips.x, neck.y - hips.y, neck.z - hips.z).normalize();
    const joints: Record<JointName, V3> = {
      hips,
      chest: at('chest', 'spine'),
      neck,
      headTop: { x: head.x + up.x * 0.13 * this.height, y: head.y + up.y * 0.13 * this.height, z: head.z + up.z * 0.13 * this.height },
      lShoulder: at('leftUpperArm'),
      rShoulder: at('rightUpperArm'),
      lHip: at('leftUpperLeg'),
      rHip: at('rightUpperLeg'),
      lHand: at('leftHand'),
      rHand: at('rightHand'),
      lFoot: at('leftFoot'),
      rFoot: at('rightFoot'),
    };
    // Window heights per second to world units: the figure fills about this share of the window.
    const perHeight = this.height / FIGURE_SHARE;
    return new Ragdoll({
      joints,
      velocity: { x: speed.side * perHeight, y: -speed.down * perHeight, z: 0 },
      floor: this.restPosition.y,
      height: this.height,
      arm: this.armParts,
      leg: this.legParts,
    });
  }

  /**
   * One ragdoll frame: the points fall on, the body turns on the screen as the trunk lies, the
   * hips take the trunk's tilt, head and limbs point along their points, and the hips are put
   * where their point is.
   */
  private poseRagdoll(doll: Ragdoll, dt: number) {
    doll.step(dt);
    const scene = this.vrm.scene;
    const { up, left } = doll.frame();
    // The turn on the screen that stands the trunk where it lies (as `turn` for skirts and hair).
    const onScreen = this.a.set(up.x, up.y, up.z).transformDirection(this.camera.matrixWorldInverse);
    this.roll = Math.atan2(-onScreen.x, onScreen.y);
    this.rollSpeed = this.pitch = this.pitchSpeed = 0;
    this.weight = 0;
    const towardsCamera = this.camera.getWorldDirection(this.viewAxis).negate();
    this.turn.setFromAxisAngle(towardsCamera, this.roll);
    scene.quaternion.copy(this.turn).multiply(this.restTurn);
    scene.position.copy(this.restPosition).add(this.offset);
    scene.updateMatrixWorld(true);
    const hips = this.bone('hips');
    const neck = this.bone('neck');
    const lHip = this.bone('leftUpperLeg');
    const rHip = this.bone('rightUpperLeg');
    if (!hips || !neck || !lHip || !rHip) return;
    // The trunk's tilt and twist (front or back to the camera) from the hips.
    const nowUp = this.b.subVectors(neck.getWorldPosition(this.b), hips.getWorldPosition(this.c)).normalize();
    const nowLeftRaw = this.d.subVectors(lHip.getWorldPosition(this.d), rHip.getWorldPosition(this.e));
    const nowLeft = nowLeftRaw.addScaledVector(nowUp, -nowLeftRaw.dot(nowUp)).normalize();
    const nowFront = this.e.crossVectors(nowLeft, nowUp);
    const nowTurn = this.q.setFromRotationMatrix(this.basis.makeBasis(nowLeft, nowUp, nowFront));
    const wantUp = this.c.set(up.x, up.y, up.z);
    const wantLeft = this.f.set(left.x, left.y, left.z);
    const wantFront = this.a.crossVectors(wantLeft, wantUp);
    const wantTurn = this.q4.setFromRotationMatrix(this.basis.makeBasis(wantLeft, wantUp, wantFront));
    this.turnInWorld(hips, this.q6.copy(wantTurn).multiply(nowTurn.invert()));
    // Head, arms and legs along their points (elbows and knees bent like hinges).
    const p = doll.pos;
    const towards = (from: V3, to: V3): V3 => ({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
    this.aim(neck, this.bone('head'), towards(p.neck, p.headTop));
    for (const [side, s] of [['left', 'l'], ['right', 'r']] as const) {
      const elbow = doll.elbow(s);
      const knee = doll.knee(s);
      this.aim(this.bone(`${side}UpperArm`), this.bone(`${side}LowerArm`), towards(p[`${s}Shoulder`], elbow));
      this.aim(this.bone(`${side}LowerArm`), this.bone(`${side}Hand`), towards(elbow, p[`${s}Hand`]));
      this.aim(this.bone(`${side}UpperLeg`), this.bone(`${side}LowerLeg`), towards(p[`${s}Hip`], knee));
      this.aim(this.bone(`${side}LowerLeg`), this.bone(`${side}Foot`), towards(knee, p[`${s}Foot`]));
    }
    // The hips where their point is.
    const hipsAt = hips.getWorldPosition(this.a);
    this.offset.x += p.hips.x - hipsAt.x;
    this.offset.y += p.hips.y - hipsAt.y;
    this.offset.z += p.hips.z - hipsAt.z;
    scene.position.copy(this.restPosition).add(this.offset);
    scene.updateMatrixWorld(true);
    for (const name of DOLL_BONES) {
      const node = this.bone(name);
      if (!node) continue;
      const kept = this.dollPose.get(name);
      if (kept) kept.copy(node.quaternion);
      else this.dollPose.set(name, node.quaternion.clone());
    }
  }

  /** Turns a bone by `angle` about a world axis (whatever way the rig's own axes point). */
  private bendInWorld(node: THREE.Object3D, axis: THREE.Vector3, angle: number) {
    const parent = node.parent;
    if (parent) parent.getWorldQuaternion(this.q3);
    else this.q3.identity();
    // In the parent's space: parent⁻¹ · turn · parent, applied before the bone's own turn.
    this.q4.setFromAxisAngle(axis, angle);
    const inParent = this.q5.copy(this.q3).invert().multiply(this.q4).multiply(this.q3);
    node.quaternion.premultiply(inParent);
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
   * Applies hanging and getting up over the pose so far (motion, procedural body, seat). `sway`
   * is the window's speed (window heights per second, y down, from `BodySway`).
   */
  apply(delta: number, elapsed: number, sway: { x: number; y: number }) {
    // Up to a quarter second per frame (a slow frame or a low frame rate keeps real time); the
    // swing and the tipping are stepped in small pieces below.
    const dt = Math.min(0.25, Math.max(1e-3, delta));
    const steps = Math.ceil(dt / MAX_STEP);
    const step = dt / steps;
    const hang = this.hang;
    const grabbed = this.grabbed;
    const recover = this.recover;
    // Falling as a ragdoll: the points move the body; getting up takes over afterwards.
    if (recover && this.doll) {
      if (elapsed - recover.start < RAGDOLL_S) {
        this.lastSpeed.x = sway.x;
        this.lastSpeed.y = sway.y;
        this.poseRagdoll(this.doll, dt);
        return;
      }
      recover.from = this.roll;
      this.doll = null;
      this.dollEndAt = elapsed;
    }
    const ragdolled = !!recover && usesRagdoll(recover);
    const t = recover ? recoverClock(recover, elapsed - recover.start) : 0;
    const phases = recover ? RECOVER_PHASES[recover.kind] : null;
    // Lying as it fell until the impact is over; then tipping into the seat.
    const lying = !!recover && !!phases && t < phases.impact && !ragdolled;

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
    }

    const accel = { x: (sway.x - this.lastSpeed.x) / dt, y: (sway.y - this.lastSpeed.y) / dt };
    this.lastSpeed.x = sway.x;
    this.lastSpeed.y = sway.y;
    if (hang && grabbed) {
      // A pendulum about the grip (see `swingStep`), measured from hanging still.
      const swing: Swing = { angle: this.roll - rollTarget, speed: this.rollSpeed, hanging: this.hanging };
      for (let i = 0; i < steps; i++) swingStep(swing, accel, sway, grabbed.length, step);
      // Held by a foot near the floor: the head stays above it, the body lies at an angle (flat
      // with the foot on the floor) on the side it trails to, and drags along with friction.
      const ground = hang.grip === 'feet' && this.hold ? groundAngle(this.hold) : 0;
      if (ground > 0 && Math.abs(wrapAngle(swing.angle)) < ground) {
        const angle = wrapAngle(swing.angle);
        // Positive turns the body to the right on screen; pulled right it trails to the left.
        const side = Math.abs(angle) > 0.02 ? Math.sign(angle) : sway.x > 0.05 ? -1 : sway.x < -0.05 ? 1 : 1;
        swing.angle = side * ground;
        if (Math.sign(swing.speed) !== side) swing.speed = 0;
        swing.speed *= Math.max(0, 1 - GROUND_FRICTION * dt);
      }
      this.roll = rollTarget + swing.angle;
      this.rollSpeed = swing.speed;
      this.hanging = swing.hanging;
    } else if (recover && !lying) {
      // Getting up follows its timeline: falls over flat, pushes itself up, sits (see `recoverRoll`).
      this.roll = recoverRoll(recover.kind, t, recover.from, ragdolled);
      this.rollSpeed = 0;
    } else {
      for (let i = 0; i < steps; i++) {
        this.rollSpeed += (TIP_STIFFNESS * (rollTarget - this.roll) - TIP_DAMPING * this.rollSpeed) * step;
        this.roll += this.rollSpeed * step;
      }
    }
    // Arms and legs swing with the body, a little behind it.
    const limbTarget = hang && grabbed ? this.roll - rollTarget : 0;
    this.limbAngle += (limbTarget - this.limbAngle) * Math.min(1, dt * LIMB_FOLLOW);
    if (recover && !lying && phases) {
      // Folded over the hand it unfolds while it comes down onto its backside.
      const unfold = Math.min(1, Math.max(0, (t - phases.impact) / Math.max(1e-3, phases.rise - phases.impact)));
      this.pitch = recover.pitchFrom * (1 - unfold * unfold * (3 - 2 * unfold));
      this.pitchSpeed = 0;
    } else {
      for (let i = 0; i < steps; i++) {
        this.pitchSpeed += (TIP_STIFFNESS * (pitchTarget - this.pitch) - TIP_DAMPING * this.pitchSpeed) * step;
        this.pitch += this.pitchSpeed * step;
      }
    }
    // Upright again after head down or folded: long hair may have caught on the head's and
    // body's colliders on the wrong side (twin tails stood up); it falls back into place.
    if (recover && !recover.springsReset && recover.kind !== 'feet' && phases && t > phases.settle) {
      if (Math.abs(this.roll) < 0.2 && Math.abs(this.pitch) < 0.2) {
        recover.springsReset = true;
        this.vrm.springBoneManager?.reset();
      }
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
    this.curl = 0;
    if (this.weight > 0.001 && kind) {
      if (kind === 'shoulder' && grabbed?.kitten) {
        // By the collar: curled up a little like a kitten, head down, toes pointed.
        this.pose({ spine: [0.22, 0, 0], chest: [0.12, 0, 0], neck: [0.3, 0, 0], leftFoot: [0.5, 0, 0], rightFoot: [0.5, 0, 0] }, this.weight);
      } else if (kind === 'shoulder' || kind === 'hand') {
        this.pose({ spine: [0.05, 0, 0], neck: [0.22, 0, 0], leftFoot: [0.45, 0, 0], rightFoot: [0.45, 0, 0] }, this.weight);
      } else if (kind === 'hip') {
        this.pose(
          {
            spine: [0.35, 0, 0],
            chest: [0.3, 0, 0],
            upperChest: [0.2, 0, 0],
            neck: [0.3, 0, 0],
            head: [0.15, 0, 0],
            leftFoot: [0.4, 0, 0],
            rightFoot: [0.4, 0, 0],
          },
          this.weight,
        );
      } else {
        const held = grabbed?.heldLeg ?? 'left';
        // Now and then it tries to curl up towards its legs (less as it tires).
        const since = hang && grabbed ? elapsed - grabbed.at : 0;
        const tired = 1 - 0.6 * ramp(since, 0, TIRE_S);
        const curl = hang ? tired * Math.max(0, Math.sin(((since - 1) / CURL_EVERY_S) * 2 * Math.PI)) ** 3 : 0;
        this.pose(
          {
            // Head down: the back arches a little and the head tips back towards the floor.
            spine: [-0.08 + 0.5 * curl, 0, 0],
            chest: [0.35 * curl, 0, 0],
            neck: [-0.25 + 0.6 * curl, 0, 0],
            [`${held}UpperLeg` as const]: [0, 0, 0],
            // The held leg is not a rod: the knee gives a little.
            [`${held}LowerLeg` as const]: [0.12, 0, 0],
            [`${held}Foot` as const]: [0.3, 0, 0],
          } as BodyPose,
          this.weight,
        );
        this.curl = curl;
      }
    }
    // Landing on the feet: a deep crouch that springs back.
    const hips = this.bone('hips');
    if (recover?.kind === 'feet' && phases) {
      const down = t < phases.impact ? ramp(t, 0, phases.impact) : 1 - ramp(t, phases.impact, phases.total);
      this.pose(
        {
          spine: [0.3 * down, 0, 0],
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
    const towardsCamera = this.camera.getWorldDirection(this.viewAxis).negate();
    this.limbDown.copy(DOWN).applyAxisAngle(towardsCamera, this.limbAngle);
    // Forwards is a turn about +X: the figure faces the camera (+Z), its top goes towards it.
    this.turn.setFromAxisAngle(towardsCamera, this.roll).multiply(this.q.setFromAxisAngle(AXIS_X, this.pitch));
    scene.quaternion.copy(this.turn).multiply(this.restTurn);
    scene.position.copy(this.restPosition);
    scene.updateMatrixWorld(true);
    // The trunk is no rod: it trails the swing, joint by joint, the end away from the grip last.
    this.trunkRoll += (this.roll - this.trunkRoll) * Math.min(1, dt * TRUNK_FOLLOW);
    const trail = THREE.MathUtils.clamp(this.trunkRoll - this.roll, -TRUNK_BEND, TRUNK_BEND) * this.weight;
    // Head down the head is the far end; held by the collar the hips are (bending the other way).
    const bendSide = kind === 'feet' ? 1 : kind === 'shoulder' || kind === 'hand' ? -1 : 0;
    if (bendSide && Math.abs(trail) > 1e-4) {
      for (const [name, share] of TRUNK_JOINTS) {
        const node = this.bone(name);
        if (node) this.bendInWorld(node, towardsCamera, bendSide * trail * share);
      }
      scene.updateMatrixWorld(true);
    }

    // 3. Where it is: the grabbed part under the pointer; after the landing its lowest point on the floor.
    if (hang && grabbed) {
      const pivot = this.bone(grabbed.pivot);
      if (pivot) {
        const anchor = hang.grip === 'feet' && this.hold ? this.hold.anchor : hang.anchor;
        const wanted = this.anchorInWorld(anchor, this.c);
        // By a hand: the shoulder hangs an arm's length below it.
        if (grabbed.heldArm) wanted.addScaledVector(DOWN, this.armLength * 0.95);
        wanted.sub(pivot.getWorldPosition(this.b));
        this.offset.lerp(wanted, Math.min(1, dt * 14));
      }
    } else if (recover) {
      // Lying and pushing itself up it turns about the feet: the hips stay in the middle instead,
      // so the body does not slide out of the window to one side.
      const hipsNow = this.bone('hips');
      const centre = hipsNow ? -(hipsNow.getWorldPosition(this.b).x - this.restPosition.x) : 0;
      this.offset.x += (centre - this.offset.x) * Math.min(1, dt * 6);
      this.offset.z += (0 - this.offset.z) * Math.min(1, dt * 6);
      // Falls the rest of the way at once (gravity), rises gently (standing up lifts the seat).
      const floor = -(this.lowest() - this.restPosition.y) + 0.015 * this.height;
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
      // Head down it paddles with its arms (and reaches up while curling); otherwise they drift.
      const since = grabbed ? elapsed - grabbed.at : 0;
      const paddle = kind === 'feet' && hang ? 0.18 * (1 - 0.6 * ramp(since, 0, TIRE_S)) : 0.04;
      const kitten = !!grabbed?.kitten && !!hang;
      const kick = kitten && grabbed ? kittenKick(elapsed - grabbed.at) : 0;
      for (const side of ['left', 'right'] as const) {
        const shoulder = this.bone(`${side}UpperArm`);
        if (shoulder && hang && grabbed?.heldArm === side) {
          // The held arm reaches straight up to the hand holding it.
          this.reach(side, 'Arm', this.anchorInWorld(hang.anchor, this.a), this.weight);
        } else if (shoulder && kitten) {
          // By the collar: paws held in front, batting a little while it kicks.
          const bat = kick * 0.15 * Math.sin(elapsed * 10 + (side === 'left' ? 0 : 1.7));
          const target = shoulder
            .getWorldPosition(this.a)
            .addScaledVector(this.limbDown, this.armLength * (0.55 + bat))
            .addScaledVector(front, this.armLength * 0.5);
          this.reach(side, 'Arm', target, this.weight);
        } else if (shoulder) {
          const phase = side === 'left' ? 0 : 2.1;
          const forward = paddle * Math.sin(elapsed * (kind === 'feet' ? 2.7 : 1.7) + phase) + struggle * 0.1 * Math.sin(elapsed * 7 + phase);
          const target = shoulder
            .getWorldPosition(this.a)
            .addScaledVector(this.limbDown, this.armLength * (0.97 - 0.45 * this.curl))
            .addScaledVector(front, this.armLength * (forward + 0.35 * this.curl));
          this.reach(side, 'Arm', target, this.weight);
        }
        const hip = this.bone(`${side}UpperLeg`);
        if (!hip || grabbed?.heldLeg === side) continue;
        const target = hip.getWorldPosition(this.a);
        if (kind === 'feet') {
          // The free leg sinks towards the floor and falls aside (not across the body), the knee bent.
          const held = this.bone(`${grabbed?.heldLeg ?? 'left'}UpperLeg`);
          const away = held ? this.b.subVectors(target, held.getWorldPosition(this.b)).setY(0).normalize() : this.b.set(0, 0, 0);
          const drop = this.d.copy(this.limbDown).addScaledVector(away, 0.6).addScaledVector(front, -0.1).normalize();
          target.addScaledVector(drop, this.legLength * 0.85);
        } else if (kitten) {
          // Knees drawn up, the legs pedalling in bursts.
          const pedal = kick * 0.28 * Math.sin(elapsed * 12 + (side === 'left' ? 0 : Math.PI));
          target.addScaledVector(this.limbDown, this.legLength * (0.66 + pedal * 0.4)).addScaledVector(front, this.legLength * (0.32 + pedal));
        } else {
          const swingLeg = struggle * 0.22 * Math.sin(elapsed * 9 + (side === 'left' ? 0 : Math.PI));
          target.addScaledVector(this.limbDown, this.legLength * (0.96 - Math.abs(swingLeg) * 0.3)).addScaledVector(front, this.legLength * swingLeg);
        }
        this.reach(side, 'Leg', target, this.weight);
      }
    }

    // 5. Sitting after the landing: one hand rubs the head (or the lower back).
    if (recover && phases && recover.kind !== 'feet') {
      // Pushing itself up: the hand on the floor side leans on the ground beside the hips.
      const push = recoverPush(recover.kind, t, ragdolled);
      const hipsAt = this.bone('hips');
      if (push > 0.001 && hipsAt) {
        const left = this.bone('leftUpperArm');
        const right = this.bone('rightUpperArm');
        if (left && right) {
          const lower = left.getWorldPosition(this.a).y < right.getWorldPosition(this.b).y ? 'left' : 'right';
          const shoulder = lower === 'left' ? left : right;
          const floorY = this.restPosition.y + 0.02 * this.height;
          const target = shoulder
            .getWorldPosition(this.c)
            .lerp(hipsAt.getWorldPosition(this.d), 0.45)
            .setY(floorY);
          this.reach(lower, 'Arm', target, push);
        }
      }
      // Standing up it leans forward over its feet, as one does getting up from the floor.
      const lean = recoverLean(recover.kind, t);
      if (lean > 0.001) {
        this.pose({ spine: [0.35, 0, 0], chest: [0.2, 0, 0], neck: [-0.15, 0, 0] }, 0.8 * lean);
        scene.updateMatrixWorld(true);
      }
      const rub = ramp(t, phases.rise - 0.2, phases.rise + 0.3) * (1 - ramp(t, phases.rub - 0.4, phases.rub));
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
          this.pose(recover.kind === 'head' ? { neck: [0.3, 0, -0.1], spine: [0.1, 0, 0] } : { spine: [-0.15, 0, 0], neck: [-0.1, 0, 0] }, rub);
          scene.updateMatrixWorld(true);
          this.reach(side, 'Arm', target, rub);
        }
      }
    }

    // Just handed over from the ragdoll: the bones blend from how it lay into getting up.
    if (this.dollEndAt !== null) {
      const share = (elapsed - this.dollEndAt) / DOLL_BLEND_S;
      if (share >= 1 || !recover) {
        this.dollEndAt = null;
      } else {
        const ease = share * share * (3 - 2 * share);
        for (const [name, kept] of this.dollPose) {
          const node = this.bone(name);
          if (node) node.quaternion.copy(this.q6.copy(kept).slerp(node.quaternion, ease));
        }
        scene.updateMatrixWorld(true);
      }
    }
  }
}
