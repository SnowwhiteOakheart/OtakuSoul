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

  it('finds the arms of MMD (English and Japanese) and 3ds Max Biped rigs', () => {
    expect(plainBoneName('Bip001 L UpperArm')).toBe('bip001lupperarm');
    expect(plainBoneName('左ひじ')).toBe('左ひじ');
    const mmd = new THREE.Group();
    const hips = bone('Hips', mmd);
    const leftArm = bone('Left arm', bone('Left shoulder', bone('Spine', hips)));
    const leftElbow = bone('Left elbow', leftArm);
    const japanese = new THREE.Group();
    const upper = bone('上半身', bone('下半身', japanese));
    const rightElbow = bone('右ひじ', bone('右腕', upper));
    const biped = new THREE.Group();
    const bipForearm = bone('Bip001 L Forearm', bone('Bip001 L UpperArm', bone('Bip001 Spine', bone('Bip001 Pelvis', biped))));
    expect(findRigBones(mmd)).toMatchObject({ hips, leftArm, leftForeArm: leftElbow });
    expect(findRigBones(japanese)).toMatchObject({ spine: upper, rightForeArm: rightElbow });
    expect(findRigBones(biped).leftForeArm).toBe(bipForearm);
  });

  it('finds legs, hands and fingers of every rig family', () => {
    const rig = (names: string[]) => {
      const root = new THREE.Group();
      for (const name of names) bone(name, root);
      const found = findRigBones(root);
      return Object.fromEntries(Object.entries(found).map(([role, node]) => [role, node!.name]));
    };
    expect(rig(['Bip001-L-Thigh', 'Bip001-L-Calf', 'Bip001-L-Foot', 'Bip001-L-Toe0', 'Bip001-L-Clavicle', 'Bip001-L-Hand', 'Bip001-L-Finger0', 'Bip001-L-Finger11', 'Bip001-R-Finger42'])).toMatchObject({
      leftUpLeg: 'Bip001-L-Thigh', leftLeg: 'Bip001-L-Calf', leftFoot: 'Bip001-L-Foot', leftToeBase: 'Bip001-L-Toe0',
      leftShoulder: 'Bip001-L-Clavicle', leftHand: 'Bip001-L-Hand', leftThumb1: 'Bip001-L-Finger0', leftIndex2: 'Bip001-L-Finger11', rightPinky3: 'Bip001-R-Finger42',
    });
    expect(rig(['thigh_l', 'calf_l', 'ball_l', 'hand_r', 'index_02_r', 'thumb_01_l'])).toMatchObject({
      leftUpLeg: 'thigh_l', leftLeg: 'calf_l', leftToeBase: 'ball_l', rightHand: 'hand_r', rightIndex2: 'index_02_r', leftThumb1: 'thumb_01_l',
    });
    expect(rig(['J_Bip_L_UpperLeg', 'J_Bip_L_LowerLeg', 'J_Bip_R_Little3', 'J_Bip_C_Chest'])).toMatchObject({
      leftUpLeg: 'J_Bip_L_UpperLeg', leftLeg: 'J_Bip_L_LowerLeg', rightPinky3: 'J_Bip_R_Little3', spine1: 'J_Bip_C_Chest',
    });
    expect(rig(['thigh.L', 'shin.L', 'f_middle.01.R'])).toMatchObject({ leftUpLeg: 'thigh.L', leftLeg: 'shin.L', rightMiddle1: 'f_middle.01.R' });
    // MMD: "Left leg" is the thigh when there is a "Left knee"; Mixamo's "LeftLeg" stays the shin.
    expect(rig(['Left leg', 'Left knee', 'Left ankle', 'IndexFinger2_L', '右足', '右ひざ', '右親指０'])).toMatchObject({
      leftUpLeg: 'Left leg', leftLeg: 'Left knee', leftFoot: 'Left ankle', leftIndex2: 'IndexFinger2_L', rightUpLeg: '右足', rightLeg: '右ひざ', rightThumb1: '右親指０',
    });
    expect(rig(['finger1-1_L', 'finger5-3_R'])).toMatchObject({ leftThumb1: 'finger1-1_L', rightPinky3: 'finger5-3_R' });
    expect(rig(['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg'])).toMatchObject({ leftUpLeg: 'mixamorig:LeftUpLeg', leftLeg: 'mixamorig:LeftLeg' });
  });

  it('moves Mixamo legs and fingers onto a Biped rig', () => {
    const source = new THREE.Group();
    const sourceHips = bone('mixamorigHips', source);
    const sourceThigh = bone('mixamorigLeftUpLeg', sourceHips);
    const sourceIndex = bone('mixamorigLeftHandIndex1', sourceHips);
    const target = new THREE.Group();
    const pelvis = bone('Bip001-Pelvis', target);
    const thigh = bone('Bip001-L-Thigh', pelvis);
    const index = bone('Bip001-L-Finger1', pelvis);
    const clip = new THREE.AnimationClip('mixamo.com', 1, [
      new THREE.QuaternionKeyframeTrack(`${sourceThigh.name}.quaternion`, [0], aboutZ(0.4).toArray()),
      new THREE.QuaternionKeyframeTrack(`${sourceIndex.name}.quaternion`, [0], aboutZ(0.2).toArray()),
    ]);
    const result = retargetToRig(clip, source, target, captureRest(target));
    expect(result.tracks.map((t) => t.name).sort()).toEqual([`${index.uuid}.quaternion`, `${thigh.uuid}.quaternion`].sort());
  });

  it('uses the Japanese morphs of models converted from MMD', () => {
    const names = ['あ', 'まばたき', '笑い', 'a'];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geometry.morphAttributes.position = names.map(() => new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMorphTargets();
    mesh.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
    const face = new MorphFace(mesh);
    expect(face.supported).toEqual(expect.arrayContaining(['aa', 'blink', 'happy']));
    face.set('happy', 0.8);
    face.set('aa', 0.5);
    face.apply();
    expect(mesh.morphTargetInfluences).toEqual([0.5, 0, 0.8, 0]);
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
