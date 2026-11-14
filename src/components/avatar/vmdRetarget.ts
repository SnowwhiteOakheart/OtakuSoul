import * as THREE from 'three';
import { VmdObject } from '@moeru/three-mmd';
import type { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';

const MMD_TO_METRES = 0.08;
const MMD_FPS = 30;
/** Standard MMD PMX reference hips height (~11 MMD units * 0.08 m). */
const MMD_REFERENCE_HIPS_HEIGHT = 0.88;
/** Standard MMD A-pose upper-arm angle (~37 degrees downwards around Z in +Z-facing space). */
const A_POSE_ANGLE_RAD = (37 * Math.PI) / 180;

/** Maps Japanese MMD bone names onto VRM humanoid bone names. */
export const MMD_VRM_BONES: Record<string, VRMHumanBoneName> = {
  // Core spine & pelvis (handled explicitly for hips/lowerBody/upperBody separation)
  '全ての親': 'hips',
  'センター': 'hips',
  'グルーブ': 'hips',
  '下半身': 'hips',
  '上半身': 'spine',
  '上半身2': 'upperChest',
  '首': 'neck',
  '頭': 'head',

  // Arms & hands
  '左肩': 'leftShoulder',
  '左腕': 'leftUpperArm',
  '左ひじ': 'leftLowerArm',
  '左手首': 'leftHand',
  '右肩': 'rightShoulder',
  '右腕': 'rightUpperArm',
  '右ひじ': 'rightLowerArm',
  '右手首': 'rightHand',

  // Legs & feet
  '左足': 'leftUpperLeg',
  '左ひざ': 'leftLowerLeg',
  '左足首': 'leftFoot',
  '左つま先': 'leftToes',
  '右足': 'rightUpperLeg',
  '右ひざ': 'rightLowerLeg',
  '右足首': 'rightFoot',
  '右つま先': 'rightToes',

  // Left fingers
  '左親指０': 'leftThumbMetacarpal',
  '左親指１': 'leftThumbProximal',
  '左親指２': 'leftThumbDistal',
  '左人指１': 'leftIndexProximal',
  '左人指２': 'leftIndexIntermediate',
  '左人指３': 'leftIndexDistal',
  '左中指１': 'leftMiddleProximal',
  '左中指２': 'leftMiddleIntermediate',
  '左中指３': 'leftMiddleDistal',
  '左薬指１': 'leftRingProximal',
  '左薬指２': 'leftRingIntermediate',
  '左薬指３': 'leftRingDistal',
  '左小指１': 'leftLittleProximal',
  '左小指２': 'leftLittleIntermediate',
  '左小指３': 'leftLittleDistal',

  // Right fingers
  '右親指０': 'rightThumbMetacarpal',
  '右親指１': 'rightThumbProximal',
  '右親指２': 'rightThumbDistal',
  '右人指１': 'rightIndexProximal',
  '右人指２': 'rightIndexIntermediate',
  '右人指３': 'rightIndexDistal',
  '右中指１': 'rightMiddleProximal',
  '右中指２': 'rightMiddleIntermediate',
  '右中指３': 'rightMiddleDistal',
  '右薬指１': 'rightRingProximal',
  '右薬指２': 'rightRingIntermediate',
  '右薬指３': 'rightRingDistal',
  '右小指１': 'rightLittleProximal',
  '右小指２': 'rightLittleIntermediate',
  '右小指３': 'rightLittleDistal',
};

export interface MatchedVmdMorph {
  preset: VRMExpressionPresetName;
  score: number;
  scale: number;
}

const MORPH_DICTIONARY: ReadonlyArray<[string, VRMExpressionPresetName, number, number]> = [
  // Vowels (exact names score highest)
  ['あ', 'aa', 100, 1.0],
  ['あ2', 'aa', 85, 1.0],
  ['い', 'ih', 100, 1.0],
  ['う', 'ou', 100, 1.0],
  ['え', 'ee', 100, 1.0],
  ['お', 'oh', 100, 1.0],
  ['ワ', 'aa', 70, 0.9],
  ['ω', 'oh', 60, 0.65],

  // Blink
  ['まばたき', 'blink', 100, 1.0],
  ['ウィンク', 'blinkLeft', 95, 1.0],
  ['ウィンク２', 'blinkLeft', 85, 1.0],
  ['ウィンク左', 'blinkLeft', 98, 1.0],
  ['ｳｨﾝｸ', 'blinkLeft', 80, 1.0],
  ['ウィンク右', 'blinkRight', 98, 1.0],
  ['ウィンク２右', 'blinkRight', 85, 1.0],
  ['ｳｨﾝｸ右', 'blinkRight', 80, 1.0],

  // Emotions (single-winner per VRM preset avoids double activation)
  ['笑い', 'happy', 95, 0.85],
  ['にこり', 'happy', 90, 0.8],
  ['にっこり', 'happy', 88, 0.8],
  ['笑顔', 'happy', 92, 0.85],
  ['喜び', 'happy', 84, 0.85],
  ['怒り', 'angry', 95, 0.9],
  ['困る', 'sad', 90, 0.85],
  ['悲しい', 'sad', 95, 0.9],
  ['哀', 'sad', 82, 0.85],
  ['びっくり', 'surprised', 95, 0.9],
  ['驚き', 'surprised', 92, 0.9],
  ['じと目', 'relaxed', 88, 0.75],
  ['なごみ', 'relaxed', 92, 0.8],
];

/** Scores a Japanese MMD morph name onto a VRM preset expression so synonyms resolve cleanly. */
export function matchVmdMorphToVrmExpression(morphName: string): MatchedVmdMorph | null {
  const name = morphName.trim();
  if (!name) return null;

  for (const [pattern, preset, score, scale] of MORPH_DICTIONARY) {
    if (name === pattern) {
      return { preset, score, scale };
    }
  }
  const lower = name.toLowerCase();
  if (lower === 'a' || lower === 'aa') return { preset: 'aa', score: 90, scale: 1.0 };
  if (lower === 'i' || lower === 'ih') return { preset: 'ih', score: 90, scale: 1.0 };
  if (lower === 'u' || lower === 'ou') return { preset: 'ou', score: 90, scale: 1.0 };
  if (lower === 'e' || lower === 'ee') return { preset: 'ee', score: 90, scale: 1.0 };
  if (lower === 'o' || lower === 'oh') return { preset: 'oh', score: 90, scale: 1.0 };
  if (lower === 'blink' || lower === 'blink_both') return { preset: 'blink', score: 90, scale: 1.0 };

  for (const [pattern, preset, score, scale] of MORPH_DICTIONARY) {
    if (pattern.length >= 2 && name.includes(pattern)) {
      return { preset, score: Math.max(40, score - 25), scale };
    }
  }
  return null;
}

/**
 * Solves VMD's normalized cubic Bézier curve (`x(u) = t` → `y(u)`) for smooth non-linear
 * keyframe interpolation with binary search + Newton-Raphson refinement.
 */
export function evaluateVmdBezier(
  x1Raw: number,
  y1Raw: number,
  x2Raw: number,
  y2Raw: number,
  tInput: number,
): number {
  const t = Math.min(1, Math.max(0, tInput));
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const x1 = Math.min(1, Math.max(0, x1Raw));
  const y1 = Math.min(1, Math.max(0, y1Raw));
  const x2 = Math.min(1, Math.max(0, x2Raw));
  const y2 = Math.min(1, Math.max(0, y2Raw));

  if (Math.abs(x1 - y1) < 1e-4 && Math.abs(x2 - y2) < 1e-4) {
    return t;
  }

  const sample = (c1: number, c2: number, u: number) => {
    const inv = 1 - u;
    return 3 * u * inv * inv * c1 + 3 * u * u * inv * c2 + u * u * u;
  };
  const sampleDeriv = (c1: number, c2: number, u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * c1 + 6 * inv * u * (c2 - c1) + 3 * u * u * (1 - c2);
  };

  let lo = 0;
  let hi = 1;
  let u = t;
  for (let iter = 0; iter < 8; iter += 1) {
    const x = sample(x1, x2, u);
    const err = x - t;
    if (Math.abs(err) < 1e-5) break;
    if (err < 0) lo = u;
    else hi = u;
    const dx = sampleDeriv(x1, x2, u);
    const candidate = Math.abs(dx) > 1e-5 ? u - err / dx : (lo + hi) * 0.5;
    u = candidate > lo && candidate < hi ? candidate : (lo + hi) * 0.5;
  }
  return Math.min(1, Math.max(0, sample(y1, y2, u)));
}

interface RawBoneSample {
  frame: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  interpolation: Uint8Array;
}

const LEFT_APOSE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -A_POSE_ANGLE_RAD);
const LEFT_APOSE_INV = LEFT_APOSE.clone().invert();
const RIGHT_APOSE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), A_POSE_ANGLE_RAD);
const RIGHT_APOSE_INV = RIGHT_APOSE.clone().invert();

function armSideForBone(mmdBoneName: string): 'left' | 'right' | null {
  if (mmdBoneName.startsWith('左')) return 'left';
  if (mmdBoneName.startsWith('右')) return 'right';
  return null;
}

function isArmDescendantMmdBone(mmdBoneName: string): boolean {
  return (
    mmdBoneName === '左ひじ' ||
    mmdBoneName === '左手首' ||
    mmdBoneName === '右ひじ' ||
    mmdBoneName === '右手首' ||
    mmdBoneName.includes('親指') ||
    mmdBoneName.includes('人指') ||
    mmdBoneName.includes('中指') ||
    mmdBoneName.includes('薬指') ||
    mmdBoneName.includes('小指')
  );
}

/** Converts an MMD bone local delta quaternion into VRM T-pose normalized local space. */
function convertBoneRotation(mmdBoneName: string, q: THREE.Quaternion, isVrm0: boolean): THREE.Quaternion {
  const out = q.clone().normalize();
  if (mmdBoneName === '左腕') {
    out.multiply(LEFT_APOSE);
  } else if (mmdBoneName === '右腕') {
    out.multiply(RIGHT_APOSE);
  } else if (isArmDescendantMmdBone(mmdBoneName)) {
    const side = armSideForBone(mmdBoneName);
    if (side === 'left') {
      out.premultiply(LEFT_APOSE_INV).multiply(LEFT_APOSE);
    } else if (side === 'right') {
      out.premultiply(RIGHT_APOSE_INV).multiply(RIGHT_APOSE);
    }
  }
  if (isVrm0) {
    out.set(-out.x, out.y, -out.z, out.w);
  }
  return out.normalize();
}

/** Samples a sorted bone frame channel with VMD cubic Bézier timing. */
function sampleChannelAtFrame(
  frames: readonly RawBoneSample[],
  frame: number,
): { position: THREE.Vector3; rotation: THREE.Quaternion } {
  if (frames.length === 0) {
    return { position: new THREE.Vector3(), rotation: new THREE.Quaternion() };
  }
  if (frame <= frames[0]!.frame) {
    return {
      position: frames[0]!.position.clone(),
      rotation: frames[0]!.rotation.clone(),
    };
  }
  const last = frames[frames.length - 1]!;
  if (frame >= last.frame) {
    return {
      position: last.position.clone(),
      rotation: last.rotation.clone(),
    };
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.frame <= frame) lo = mid;
    else hi = mid;
  }
  const a = frames[lo]!;
  const b = frames[hi]!;
  const span = Math.max(1, b.frame - a.frame);
  const t = (frame - a.frame) / span;
  const interp = b.interpolation;

  const evalAxis = (c: number) =>
    interp.length >= 16
      ? evaluateVmdBezier(
          interp[c]! / 127,
          interp[c + 4]! / 127,
          interp[c + 8]! / 127,
          interp[c + 12]! / 127,
          t,
        )
      : t;

  const px = a.position.x + (b.position.x - a.position.x) * evalAxis(0);
  const py = a.position.y + (b.position.y - a.position.y) * evalAxis(1);
  const pz = a.position.z + (b.position.z - a.position.z) * evalAxis(2);
  const tr = evalAxis(3);

  const qA = a.rotation;
  const qB = b.rotation.clone();
  if (qA.dot(qB) < 0) qB.set(-qB.x, -qB.y, -qB.z, -qB.w);
  const rot = qA.clone().slerp(qB, tr).normalize();
  return { position: new THREE.Vector3(px, py, pz), rotation: rot };
}

function collectDenseFrames(sources: readonly (readonly RawBoneSample[])[]): number[] {
  const set = new Set<number>();
  for (const list of sources) {
    for (let i = 0; i < list.length; i += 1) {
      const curr = list[i]!;
      set.add(curr.frame);
      if (i > 0) {
        const prev = list[i - 1]!;
        const gap = curr.frame - prev.frame;
        // Subdivide spans >= 6 frames with non-trivial motion so cubic Bézier easing tracks smoothly.
        const nonLinear =
          curr.interpolation.length >= 16 &&
          (Math.abs(curr.interpolation[3]! - curr.interpolation[7]!) > 4 ||
            Math.abs(curr.interpolation[11]! - curr.interpolation[15]!) > 4);
        if (gap >= 6 && (nonLinear || prev.rotation.angleTo(curr.rotation) > 0.35)) {
          const steps = Math.min(8, Math.ceil(gap / 4));
          for (let s = 1; s < steps; s += 1) {
            set.add(prev.frame + (gap * s) / steps);
          }
        }
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/** Resolves which VRM humanoid bone should receive an MMD bone when optional chest/shoulder bones are absent. */
function resolveVrmBoneNode(vrm: VRM, mmdBoneName: string): THREE.Object3D | null {
  const mapped = MMD_VRM_BONES[mmdBoneName];
  if (!mapped) return null;
  const direct = vrm.humanoid.getNormalizedBoneNode(mapped);
  if (direct) return direct;
  if (mapped === 'upperChest') {
    return vrm.humanoid.getNormalizedBoneNode('chest') ?? vrm.humanoid.getNormalizedBoneNode('spine');
  }
  if (mapped === 'chest') {
    return vrm.humanoid.getNormalizedBoneNode('spine');
  }
  return null;
}

/**
 * Retargets a `.vmd` vocaloid/MMD motion binary onto a Three.js `VRM` avatar independently,
 * preserving A-pose ↔ T-pose rest alignment, Bézier keyframe curves, hip scaling and VRM 0.x facing.
 */
export function retargetVmdToVrm(buffer: ArrayBufferLike, vrm: VRM): THREE.AnimationClip {
  const vmd = VmdObject.ParseFromBuffer(buffer);
  const byBone = new Map<string, RawBoneSample[]>();
  const isVrm0 = vrm.meta?.metaVersion === '0';

  const boneCount = vmd.boneKeyFrames.length;
  for (let i = 0; i < boneCount; i += 1) {
    const kf = vmd.boneKeyFrames.get(i);
    if (!kf || !MMD_VRM_BONES[kf.boneName]) continue;
    let list = byBone.get(kf.boneName);
    if (!list) {
      list = [];
      byBone.set(kf.boneName, list);
    }
    const [px, py, pz] = kf.position;
    const [rx, ry, rz, rw] = kf.rotation;
    list.push({
      frame: kf.frameNumber,
      position: new THREE.Vector3(px, py, -pz),
      rotation: new THREE.Quaternion(-rx, -ry, rz, rw).normalize(),
      interpolation: kf.interpolation,
    });
  }
  for (const list of byBone.values()) {
    list.sort((a, b) => a.frame - b.frame);
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
  const hipsRestPos = hipsNode ? hipsNode.position.clone() : new THREE.Vector3(0, MMD_REFERENCE_HIPS_HEIGHT, 0);
  const hipsRestY = Math.max(0.25, hipsNode ? Math.abs(hipsRestPos.y) : MMD_REFERENCE_HIPS_HEIGHT);
  const hipsScale = Math.min(1.5, Math.max(0.55, hipsRestY / MMD_REFERENCE_HIPS_HEIGHT));

  // Combined root translation & pelvis orientation (センター + グルーブ + 下半身).
  if (hipsNode) {
    const centerFrames = byBone.get('センター') ?? [];
    const grooveFrames = byBone.get('グルーブ') ?? [];
    const lowerFrames = byBone.get('下半身') ?? [];
    const rootFrames = collectDenseFrames([centerFrames, grooveFrames, lowerFrames]);

    if (rootFrames.length > 0) {
      const times: number[] = [];
      const posValues: number[] = [];
      const rotValues: number[] = [];
      for (const frame of rootFrames) {
        const c = sampleChannelAtFrame(centerFrames, frame);
        const g = sampleChannelAtFrame(grooveFrames, frame);
        const l = sampleChannelAtFrame(lowerFrames, frame);

        const posDelta = c.position.add(g.position).multiplyScalar(MMD_TO_METRES * hipsScale);
        if (isVrm0) {
          posDelta.x = -posDelta.x;
          posDelta.z = -posDelta.z;
        }
        const finalPos = hipsRestPos.clone().add(posDelta);
        times.push(frame / MMD_FPS);
        posValues.push(finalPos.x, finalPos.y, finalPos.z);

        const qHips = convertBoneRotation('下半身', c.rotation.multiply(l.rotation), isVrm0);
        rotValues.push(qHips.x, qHips.y, qHips.z, qHips.w);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, posValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${hipsNode.name}.quaternion`, times, rotValues));
    }
  }

  // Spine compensates for `下半身` so upper body orientation matches MMD's sibling hierarchy.
  const spineNode = vrm.humanoid.getNormalizedBoneNode('spine');
  const upperFrames = byBone.get('上半身') ?? [];
  const lowerFrames = byBone.get('下半身') ?? [];
  if (spineNode && (upperFrames.length > 0 || lowerFrames.length > 0)) {
    const spineFrames = collectDenseFrames([upperFrames, lowerFrames]);
    const times: number[] = [];
    const rotValues: number[] = [];
    for (const frame of spineFrames) {
      const u = sampleChannelAtFrame(upperFrames, frame);
      const l = sampleChannelAtFrame(lowerFrames, frame);
      const compensated = l.rotation.clone().invert().multiply(u.rotation);
      const q = convertBoneRotation('上半身', compensated, isVrm0);
      times.push(frame / MMD_FPS);
      rotValues.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${spineNode.name}.quaternion`, times, rotValues));
  }

  // Remaining mapped humanoid & finger bones.
  const handledRootBones = new Set(['全ての親', 'センター', 'グルーブ', '下半身', '上半身']);
  // Merge multiple MMD bones that resolve onto the same target VRM node (e.g. 上半身2 -> chest fallback).
  const byTargetNode = new Map<string, { node: THREE.Object3D; sources: Array<{ name: string; list: RawBoneSample[] }> }>();

  for (const [mmdBoneName, list] of byBone.entries()) {
    if (handledRootBones.has(mmdBoneName) || list.length === 0) continue;
    const node = resolveVrmBoneNode(vrm, mmdBoneName);
    if (!node || !node.name) continue;
    let bucket = byTargetNode.get(node.name);
    if (!bucket) {
      bucket = { node, sources: [] };
      byTargetNode.set(node.name, bucket);
    }
    bucket.sources.push({ name: mmdBoneName, list });
  }

  for (const { node, sources } of byTargetNode.values()) {
    const frames = collectDenseFrames(sources.map((s) => s.list));
    if (frames.length === 0) continue;
    const times: number[] = [];
    const rotValues: number[] = [];
    for (const frame of frames) {
      const qAccum = new THREE.Quaternion();
      for (const src of sources) {
        const sampled = sampleChannelAtFrame(src.list, frame);
        qAccum.multiply(convertBoneRotation(src.name, sampled.rotation, isVrm0));
      }
      qAccum.normalize();
      times.push(frame / MMD_FPS);
      rotValues.push(qAccum.x, qAccum.y, qAccum.z, qAccum.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, rotValues));
  }

  // Facial morphs with scored single-winner selection per VRM preset.
  if (vrm.expressionManager) {
    const rawMorphs = new Map<string, Array<{ frame: number; weight: number }>>();
    const morphCount = vmd.morphKeyFrames.length;
    for (let i = 0; i < morphCount; i += 1) {
      const mf = vmd.morphKeyFrames.get(i);
      if (!mf) continue;
      let list = rawMorphs.get(mf.morphName);
      if (!list) {
        list = [];
        rawMorphs.set(mf.morphName, list);
      }
      list.push({ frame: mf.frameNumber, weight: mf.weight });
    }

    const bestPerPreset = new Map<
      VRMExpressionPresetName,
      { score: number; scale: number; list: Array<{ frame: number; weight: number }> }
    >();

    for (const [morphName, list] of rawMorphs.entries()) {
      const matched = matchVmdMorphToVrmExpression(morphName);
      if (!matched || list.length === 0) continue;
      const trackName = vrm.expressionManager.getExpressionTrackName(matched.preset);
      if (!trackName) continue;

      const activeEnergy = list.some((k) => k.weight > 0.01) ? 1000 : 0;
      const totalScore = activeEnergy + matched.score;
      const current = bestPerPreset.get(matched.preset);
      if (!current || totalScore > current.score) {
        bestPerPreset.set(matched.preset, { score: totalScore, scale: matched.scale, list });
      }
    }

    for (const [preset, entry] of bestPerPreset.entries()) {
      const trackName = vrm.expressionManager.getExpressionTrackName(preset);
      if (!trackName) continue;
      const sorted = [...entry.list].sort((a, b) => a.frame - b.frame);
      const times = sorted.map((k) => k.frame / MMD_FPS);
      const values = sorted.map((k) => Math.min(1, Math.max(0, k.weight * entry.scale)));
      tracks.push(new THREE.NumberKeyframeTrack(trackName, times, values));
    }
  }

  return new THREE.AnimationClip('vmd-retargeted', -1, tracks);
}
