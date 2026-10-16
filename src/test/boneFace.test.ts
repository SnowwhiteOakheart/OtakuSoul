import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoneFace, facePartOf } from '../components/avatar/boneFace';

/**
 * A head in metres (Y up, face to +Z) whose face bones hang on a parent that is turned 90° about X
 * and scaled by 100, like rigs that come out of Unreal in centimetres with Z up.
 */
function gameHead() {
  const root = new THREE.Group();
  const head = Object.assign(new THREE.Bone(), { name: 'Bone_head' });
  head.position.set(0, 1.3, 0);
  head.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  head.scale.setScalar(0.01);
  root.add(head);
  const toHead = (world: THREE.Vector3) => head.worldToLocal(world.clone());
  root.updateMatrixWorld(true);
  const bone = (name: string, x: number, y: number, z = 0.06) => {
    const b = Object.assign(new THREE.Bone(), { name });
    b.position.copy(toHead(new THREE.Vector3(x, y, z)));
    head.add(b);
    return b;
  };
  const bones = {
    eyeL: bone('Bon_eyeball_L', 0.04, 1.33), eyeR: bone('Bon_eyeball_R', -0.04, 1.33),
    lidUpL: bone('BON_eyelid_up_L', 0.04, 1.34), lidLoL: bone('BON_eyelid_lo_L', 0.04, 1.313),
    lidUpR: bone('BON_eyelid_up_R', -0.04, 1.34), lidLoR: bone('BON_eyelid_lo_R', -0.04, 1.313),
    browL: bone('Bon_eyebrow01_L', 0.014, 1.345), browOutL: bone('Bon_eyebrow03_L', 0.064, 1.36),
    lipLo: bone('Bon_Lolip_M', 0, 1.277), lipUp: bone('Bon_uplip_M', 0, 1.279),
    cornerL: bone('Bon_colip_L', 0.012, 1.28), cornerR: bone('Bon_colip_R', -0.012, 1.28),
  };
  root.updateMatrixWorld(true);
  return { root, ...bones };
}

const worldOf = (bone: THREE.Object3D) => {
  bone.parent!.updateMatrixWorld(true);
  return bone.getWorldPosition(new THREE.Vector3());
};

describe('BoneFace', () => {
  it('recognises face bones by name', () => {
    expect(['BON_eyelid02_up_L', 'BON_eyelid03_lo_R', 'Bon_eyebrow02_L', 'Bon_Lolip01_L', 'Bon_uplip_M', 'Bon_colip_R', 'Bon_eyeball_L', 'LowerLip', 'mouth_corner.L', 'BON_eyeCo_in_L', 'Bip001-Head']
      .map(facePartOf)).toEqual(['lidUp', 'lidLo', 'brow', 'lipLo', 'lipUp', 'corner', 'eye', 'lipLo', 'corner', null, null]);
  });

  it('closes the eyes, opens the mouth and smiles in world space, whatever the bone axes', () => {
    const rig = gameHead();
    const face = BoneFace.detect(rig.root)!;
    expect(face.supported).toEqual(expect.arrayContaining(['blink', 'aa', 'oh', 'happy', 'angry', 'sad', 'surprised', 'relaxed']));

    face.restore();
    face.set('blink', 1);
    face.apply();
    // The upper lid comes down to (nearly) the lower lid and stays in front of the eye.
    expect(worldOf(rig.lidUpL).y).toBeCloseTo(1.34 - 0.027 * 0.92, 4);
    expect(worldOf(rig.lidUpL).z).toBeCloseTo(0.06, 4);

    face.restore();
    expect(worldOf(rig.lidUpL).y).toBeCloseTo(1.34, 5);
    face.set('aa', 1);
    face.apply();
    // The unit is the eye distance (8 cm): the lower lip drops 15 % of it, the upper lip lifts a little.
    expect(worldOf(rig.lipLo).y).toBeCloseTo(1.277 - 0.15 * 0.08, 4);
    expect(worldOf(rig.lipUp).y).toBeGreaterThan(1.279);

    face.restore();
    face.set('happy', 1);
    face.apply();
    // Mouth corners rise and move apart.
    expect(worldOf(rig.cornerL).y).toBeGreaterThan(1.28);
    expect(worldOf(rig.cornerL).x).toBeGreaterThan(0.012);
    expect(worldOf(rig.cornerR).x).toBeLessThan(-0.012);

    face.restore();
    face.set('angry', 1);
    face.apply();
    // Brows lower, the inner one more than the outer one.
    expect(1.345 - worldOf(rig.browL).y).toBeGreaterThan(1.36 - worldOf(rig.browOutL).y);
  });

  it('adds on top of what animations set and ignores unknown keys', () => {
    const rig = gameHead();
    const face = BoneFace.detect(rig.root)!;
    face.restore();
    rig.lipLo.position.add(new THREE.Vector3(0, 0, 0.1)); // an animation moved the lip
    const animated = worldOf(rig.lipLo).clone();
    face.set('aa', 0.5);
    face.set('wink', 1);
    face.apply();
    expect(worldOf(rig.lipLo).y).toBeCloseTo(animated.y - 0.5 * 0.15 * 0.08, 4);
  });

  it('needs eyelids or lips', () => {
    const root = new THREE.Group();
    root.add(Object.assign(new THREE.Bone(), { name: 'Head' }));
    expect(BoneFace.detect(root)).toBeNull();
  });
});
