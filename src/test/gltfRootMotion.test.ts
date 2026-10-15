import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { withoutRootMotion } from '../components/avatar/GltfViewer';

/** root → Bip001 → pelvis → spine, like Unreal Biped rigs; `root` turned Z-up to Y-up as exported from Blender. */
function bipedRig() {
  const scene = new THREE.Group();
  const [root, com, pelvis, spine] = ['root', 'Bip001', 'Bip001-Pelvis', 'Bip001-Spine'].map((name) => Object.assign(new THREE.Bone(), { name }));
  root!.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  root!.add(com!);
  com!.add(pelvis!);
  pelvis!.add(spine!);
  scene.add(root!);
  return { scene, pelvis: pelvis! };
}

const values = (clip: THREE.AnimationClip, name: string) => Array.from(clip.tracks.find((t) => t.name === name)!.values, (v) => Math.round(v * 1000) / 1000 + 0);

describe('withoutRootMotion', () => {
  it('keeps hips and the bones above them in place sideways but lets them bob up and down', () => {
    const { scene, pelvis } = bipedRig();
    // In root's Z-up space: X/Y are sideways, Z is up. Walk 2 m forward while bobbing 5 cm.
    const clip = new THREE.AnimationClip('Walk', 1, [
      new THREE.VectorKeyframeTrack('Bip001.position', [0, 1], [0, 0, 0.85, 0, 2, 0.9]),
      new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 1, 0, 0]),
      new THREE.QuaternionKeyframeTrack('Bip001-Spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('Bip001-Spine.position', [0, 1], [0, 0, 0.1, 0, 0, 0.2]),
    ]);
    const [result] = withoutRootMotion([clip], scene, pelvis);
    expect(values(result!, 'Bip001.position')).toEqual([0, 0, 0.85, 0, 0, 0.9]);
    expect(values(result!, 'root.position')).toEqual([0, 0, 0, 0, 0, 0]);
    // Bones below the hips are not touched.
    expect(values(result!, 'Bip001-Spine.position')).toEqual([0, 0, 0.1, 0, 0, 0.2]);
    expect(result!.name).toBe('Walk');
  });

  it('anchors clips that start mid-stride to the rest place', () => {
    const { scene, pelvis } = bipedRig();
    scene.getObjectByName('Bip001')!.position.set(0, 0, 0.85);
    const clip = new THREE.AnimationClip('WalkStop', 1, [
      new THREE.VectorKeyframeTrack('Bip001.position', [0, 1], [0.4, 1.5, 0.8, 0.2, 1.8, 0.85]),
    ]);
    expect(values(withoutRootMotion([clip], scene, pelvis)[0]!, 'Bip001.position')).toEqual([0, 0, 0.8, 0, 0, 0.85]);
  });

  it('leaves clips without movement of those bones untouched', () => {
    const { scene, pelvis } = bipedRig();
    const clip = new THREE.AnimationClip('Wave', 1, [new THREE.QuaternionKeyframeTrack('Bip001-Spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
    expect(withoutRootMotion([clip], scene, pelvis)[0]).toBe(clip);
  });

  it('falls back to the top bones when the hips are unknown', () => {
    const scene = new THREE.Group();
    const top = Object.assign(new THREE.Bone(), { name: 'Armature_Root' });
    scene.add(top);
    const clip = new THREE.AnimationClip('Run', 1, [new THREE.VectorKeyframeTrack('Armature_Root.position', [0, 1], [0, 1, 0, 3, 1.1, 4])]);
    expect(values(withoutRootMotion([clip], scene)[0]!, 'Armature_Root.position')).toEqual([0, 1, 0, 0, 1.1, 0]);
  });
});
