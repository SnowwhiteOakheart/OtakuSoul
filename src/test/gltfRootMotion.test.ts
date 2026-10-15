import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { withoutRootMotion } from '../components/avatar/GltfViewer';

/** root → pelvis → spine, as Unreal rigs come out of Blender. */
function unrealRig() {
  const scene = new THREE.Group();
  const [root, pelvis, spine] = ['root', 'pelvis', 'spine_01'].map((name) => Object.assign(new THREE.Bone(), { name }));
  root!.add(pelvis!);
  pelvis!.add(spine!);
  scene.add(root!);
  return { scene, pelvis: pelvis! };
}

describe('withoutRootMotion', () => {
  it('keeps the top bone in place but the hips and rotations moving', () => {
    const { scene, pelvis } = unrealRig();
    const clip = new THREE.AnimationClip('Walk', 1, [
      new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 0, 2]),
      new THREE.QuaternionKeyframeTrack('root.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 1, 0, 0, 1.02, 0]),
      new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const [result] = withoutRootMotion([clip], scene, pelvis);
    expect(result!.tracks.map((t) => t.name)).toEqual(['root.quaternion', 'pelvis.position', 'spine_01.quaternion']);
    expect(result!.name).toBe('Walk');
  });

  it('leaves rigs whose top bone is the hips untouched', () => {
    const scene = new THREE.Group();
    const hips = Object.assign(new THREE.Bone(), { name: 'Hips' });
    scene.add(hips);
    const clip = new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 0, 1.01, 0])]);
    expect(withoutRootMotion([clip], scene, hips)[0]).toBe(clip);
  });
});
