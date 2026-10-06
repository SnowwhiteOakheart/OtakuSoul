import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { VRM } from '@pixiv/three-vrm';
import { MIXAMO_VRM_BONES, retargetMixamoClip } from '../components/avatar/mixamoRetarget';

/** A minimal VRM stand-in: normalized bones are plain nodes at the given hips height. */
const fakeVrm = (metaVersion: '0' | '1', hipsY: number) => {
  const scene = new THREE.Group();
  const hips = new THREE.Object3D();
  hips.name = 'Normalized_hips';
  hips.position.y = hipsY;
  const arm = new THREE.Object3D();
  arm.name = 'Normalized_rightUpperArm';
  scene.add(hips);
  hips.add(arm);
  const bones: Record<string, THREE.Object3D> = { hips, rightUpperArm: arm };
  scene.updateMatrixWorld(true);
  return { scene, meta: { metaVersion }, humanoid: { getNormalizedBoneNode: (name: string) => bones[name] ?? null } } as unknown as VRM;
};

/** A Mixamo rig in centimetres whose arm rests rotated by 90° around Z. */
const mixamoRig = () => {
  const root = new THREE.Group();
  const hips = new THREE.Object3D();
  hips.name = 'mixamorigHips';
  hips.position.y = 100;
  const arm = new THREE.Object3D();
  arm.name = 'mixamorigRightArm';
  arm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  root.add(hips);
  hips.add(arm);
  return root;
};

describe('retargetMixamoClip', () => {
  it('maps the standard Mixamo bones', () => {
    expect(MIXAMO_VRM_BONES.mixamorigLeftForeArm).toBe('leftLowerArm');
    expect(MIXAMO_VRM_BONES.mixamorigRightHandPinky2).toBe('rightLittleIntermediate');
    expect(MIXAMO_VRM_BONES.mixamorigLeftHandThumb1).toBe('leftThumbMetacarpal');
  });

  it('removes the Mixamo rest pose and scales the hips to the VRM', () => {
    const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const clip = new THREE.AnimationClip('mixamo.com', 1, [
      // First key: the rest pose itself; it must become no rotation on the VRM.
      new THREE.QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0, 1], [...rest.toArray(), 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0], [10, 100, 0]),
      new THREE.QuaternionKeyframeTrack('mixamorigUnknown.quaternion', [0], [0, 0, 0, 1]),
    ]);
    const result = retargetMixamoClip(clip, mixamoRig(), fakeVrm('1', 1));
    expect(result.tracks.map((t) => t.name)).toEqual(['Normalized_rightUpperArm.quaternion', 'Normalized_hips.position']);
    const first = new THREE.Quaternion().fromArray(result.tracks[0]!.values, 0);
    expect(first.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    expect(Array.from(result.tracks[1]!.values)).toEqual([0.1, 1, 0].map((n) => expect.closeTo(n, 6)));
  });

  it('mirrors X and Z for VRM 0.x', () => {
    const clip = new THREE.AnimationClip('mixamo.com', 1, [new THREE.VectorKeyframeTrack('mixamorigHips.position', [0], [10, 100, 5])]);
    const values = Array.from(retargetMixamoClip(clip, mixamoRig(), fakeVrm('0', 1)).tracks[0]!.values);
    expect(values).toEqual([-0.1, 1, -0.05].map((n) => expect.closeTo(n, 6)));
  });
});

describe('Mixamo FBX end to end', () => {
  it('parses an ASCII Mixamo FBX and lifts the VRM arm', async () => {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    // @ts-expect-error -- plain JS test helper shared with the E2E tests
    const { makeMixamoFbx } = await import('../../e2e/tools/make-fbx.mjs');
    const text: string = makeMixamoFbx();
    const rig = new FBXLoader().parse(new TextEncoder().encode(text).buffer, '');
    const source = THREE.AnimationClip.findByName(rig.animations, 'mixamo.com');
    expect(source).toBeTruthy();
    const clip = retargetMixamoClip(source!, rig, fakeVrm('1', 1));
    const arm = clip.tracks.find((t) => t.name === 'Normalized_rightUpperArm.quaternion')!;
    expect(arm).toBeTruthy();
    // At a quarter of the clip the arm is turned by 70° around Z (lifted).
    const lifted = new THREE.Quaternion().fromArray(arm.values, 4);
    expect(lifted.angleTo(new THREE.Quaternion())).toBeCloseTo((70 * Math.PI) / 180, 2);
    expect(clip.duration).toBeCloseTo(2);
  });
});
