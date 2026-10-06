import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { captureRest, findRigBones, MorphFace, plainBoneName, retargetToRig } from '../components/avatar/gltfRig';

const bone = (name: string, parent?: THREE.Object3D, rotation?: THREE.Quaternion) => {
  const node = new THREE.Bone();
  node.name = name;
  if (rotation) node.quaternion.copy(rotation);
  parent?.add(node);
  return node;
};
const aboutZ = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);

describe('glTF rig', () => {
  it('finds Mixamo-style bones with and without prefix', () => {
    expect(plainBoneName('mixamorig:LeftForeArm')).toBe('leftforearm');
    const root = new THREE.Group();
    const hips = bone('Hips', root);
    bone('mixamorigRightArm', hips);
    const found = findRigBones(root);
    expect(found.hips).toBe(hips);
    expect(found.rightArm?.name).toBe('mixamorigRightArm');
    expect(found.head).toBeUndefined();
  });

  it('mixes ARKit blendshapes and shares jawOpen between shapes', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geometry.morphAttributes.position = ['jawOpen', 'mouthFunnel', 'eyeBlinkLeft'].map(() => new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const mesh = new THREE.Mesh(geometry);
    mesh.morphTargetDictionary = { jawOpen: 0, mouthFunnel: 1, eyeBlinkLeft: 2 };
    mesh.updateMorphTargets();
    mesh.morphTargetDictionary = { jawOpen: 0, mouthFunnel: 1, eyeBlinkLeft: 2 };
    const face = new MorphFace(mesh);
    expect(face.supported).toEqual(expect.arrayContaining(['blink', 'aa', 'oh']));
    face.set('aa', 0.5);
    face.set('oh', 0.4);
    face.set('blink', 1);
    face.apply();
    expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5 * 0.8 + 0.4 * 0.5);
    expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0.32);
    expect(mesh.morphTargetInfluences![2]).toBe(1);
    // Next frame without weights closes everything again.
    face.apply();
    expect(mesh.morphTargetInfluences![0]).toBe(0);
  });

  it('retargets through world space onto a rig with another rest pose', () => {
    // Source: Mixamo T-pose arm, keyed 60° about Z. Target: same bone, but its rest is
    // already rotated by 30° (A-pose-like bind with another local axis).
    const source = new THREE.Group();
    const sourceArm = bone('mixamorigRightArm', bone('mixamorigHips', source));
    const target = new THREE.Group();
    const targetArm = bone('RightArm', bone('Hips', target), aboutZ(Math.PI / 6));
    const rest = captureRest(target);
    const keyed = aboutZ(Math.PI / 3);
    const clip = new THREE.AnimationClip('mixamo.com', 1, [
      new THREE.QuaternionKeyframeTrack(`${sourceArm.name}.quaternion`, [0], keyed.toArray()),
    ]);
    const result = retargetToRig(clip, source, target, rest);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.name).toBe(`${targetArm.uuid}.quaternion`);
    // World result = keyed change × target rest = 60° + 30°.
    const local = new THREE.Quaternion().fromArray(result.tracks[0]!.values, 0);
    expect(local.angleTo(aboutZ(Math.PI / 2))).toBeLessThan(1e-3); // keys are float32
  });
});

describe('other rig naming', () => {
  it('finds MakeHuman, Unreal and VRoid bones and retargets Mixamo onto them', () => {
    const root = new THREE.Group();
    const pelvis = bone('root', root);
    const spine = bone('spine03', pelvis);
    bone('head', bone('neck01', spine));
    const arm = bone('upperarm01_R', spine);
    bone('lowerarm01_R', arm);
    bone('upperarm_l', spine);
    bone('J_Bip_L_LowerArm', spine);
    const found = findRigBones(root);
    expect([found.hips, found.spine, found.rightArm].map((b) => b?.name)).toEqual(['root', 'spine03', 'upperarm01_R']);
    expect(found.leftArm?.name).toBe('upperarm_l');
    expect(found.leftForeArm?.name).toBe('J_Bip_L_LowerArm');

    const source = new THREE.Group();
    bone('mixamorigRightArm', bone('mixamorigHips', source));
    const clip = new THREE.AnimationClip('mixamo.com', 1, [new THREE.QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0], aboutZ(0.5).toArray())]);
    expect(retargetToRig(clip, source, root, captureRest(root)).tracks[0]?.name).toBe(`${arm.uuid}.quaternion`);
  });
});
