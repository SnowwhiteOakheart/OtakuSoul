import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/** Mixamo bone names (as FBXLoader names them, without the colon) → VRM humanoid bones. */
export const MIXAMO_VRM_BONES: Record<string, VRMHumanBoneName> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  ...Object.fromEntries(
    (['Left', 'Right'] as const).flatMap((side) => {
      const s = side === 'Left' ? 'left' : 'right';
      const fingers = (['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const).flatMap((finger) => {
        const mixamo = finger === 'Little' ? 'Pinky' : finger;
        const joints = finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
        return joints.map((joint, i) => [`mixamorig${side}Hand${mixamo}${i + 1}`, `${s}${finger}${joint}`]);
      });
      return [
        [`mixamorig${side}Shoulder`, `${s}Shoulder`],
        [`mixamorig${side}Arm`, `${s}UpperArm`],
        [`mixamorig${side}ForeArm`, `${s}LowerArm`],
        [`mixamorig${side}Hand`, `${s}Hand`],
        [`mixamorig${side}UpLeg`, `${s}UpperLeg`],
        [`mixamorig${side}Leg`, `${s}LowerLeg`],
        [`mixamorig${side}Foot`, `${s}Foot`],
        [`mixamorig${side}ToeBase`, `${s}Toes`],
        ...fingers,
      ];
    }),
  ),
};

/**
 * Turns a Mixamo clip into one for this VRM: each rotation is moved from the Mixamo rest pose
 * into the VRM's normalized (T-pose) space, the hips movement is scaled to the VRM's leg
 * length, and VRM 0.x models (rotated by 180°) get mirrored X/Z.
 */
export function retargetMixamoClip(clip: THREE.AnimationClip, rig: THREE.Object3D, vrm: VRM): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const restInverse = new THREE.Quaternion();
  const parentRest = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  rig.updateWorldMatrix(true, true);
  const mixamoHips = rig.getObjectByName('mixamorigHips');
  const vrmHips = vrm.humanoid.getNormalizedBoneNode('hips');
  const hipsHeight = Math.abs((vrmHips?.getWorldPosition(v).y ?? 1) - vrm.scene.getWorldPosition(new THREE.Vector3()).y);
  const motionHipsHeight = mixamoHips?.getWorldPosition(new THREE.Vector3()).y || 1;
  const hipsScale = hipsHeight / motionHipsHeight;
  const vrm0 = vrm.meta?.metaVersion === '0';

  for (const track of clip.tracks) {
    const [rigName, property] = track.name.split('.');
    const boneName = MIXAMO_VRM_BONES[rigName!];
    const target = boneName ? vrm.humanoid.getNormalizedBoneNode(boneName) : null;
    const source = rig.getObjectByName(rigName!);
    if (!target || !source) continue;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      source.getWorldQuaternion(restInverse).invert();
      if (source.parent) source.parent.getWorldQuaternion(parentRest);
      else parentRest.identity();
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) {
        q.fromArray(values, i).premultiply(parentRest).multiply(restInverse);
        q.toArray(values, i);
        if (vrm0) {
          values[i] = -values[i]!;
          values[i + 2] = -values[i + 2]!;
        }
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${target.name}.${property}`, Array.from(track.times), Array.from(values)));
    } else if (track instanceof THREE.VectorKeyframeTrack && property === 'position' && boneName === 'hips') {
      const values = Array.from(track.values, (value, i) => (vrm0 && i % 3 !== 1 ? -value : value) * hipsScale);
      tracks.push(new THREE.VectorKeyframeTrack(`${target.name}.${property}`, Array.from(track.times), values));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
