import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clipFitsRig } from '../components/avatar/clipFit';

/** Hips with a spine (spine → chest → head) and a left leg pointing down. */
function rig() {
  const scene = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, y: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(0, y, 0);
    parent.add(b);
    return b;
  };
  const hips = bone('Hips', scene, 0.9);
  const spine = bone('Spine', hips, 0.1);
  const chest = bone('Chest', spine, 0.15);
  bone('Head', chest, 0.3);
  const leftUpLeg = bone('LeftUpLeg', hips, -0.05);
  const leftLeg = bone('LeftLeg', leftUpLeg, -0.4);
  return { scene, bones: { hips, leftUpLeg, leftLeg } };
}

const position = (name: string, y: number) => new THREE.VectorKeyframeTrack(`${name}.position`, [0, 1], [0, y, 0, 0, y, 0]);
const rotation = (name: string, q: THREE.Quaternion) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [...q.toArray(), ...q.toArray()]);

describe('clipFitsRig', () => {
  it('accepts clips made for the skeleton', () => {
    const { scene, bones } = rig();
    const nod = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
    const clip = new THREE.AnimationClip('idle', 1, [
      position('Hips', 2.5), // hips may move freely (root motion is handled elsewhere)
      position('Spine', 0.1), position('Chest', 0.15), position('Head', 0.31),
      rotation('Head', nod),
    ]);
    expect(clipFitsRig(clip, scene, bones)).toBe(true);
  });

  it('refuses clips of a rig with other bone lengths', () => {
    const { scene, bones } = rig();
    const clip = new THREE.AnimationClip('stretched', 1, [position('Spine', 0.2), position('Chest', 0.3), position('Head', 0.6)]);
    expect(clipFitsRig(clip, scene, bones)).toBe(false);
  });

  it('refuses clips whose legs point upwards in the first frame', () => {
    const { scene, bones } = rig();
    const flipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    const clip = new THREE.AnimationClip('other-axes', 1, [rotation('LeftUpLeg', flipped)]);
    expect(clipFitsRig(clip, scene, bones)).toBe(false);
  });
});
