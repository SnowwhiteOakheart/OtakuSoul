// A small glTF avatar (GLB) for tests, made with three.js itself: boxes on a Mixamo-style rig
// without prefix (Hips, Spine, Neck, Head, Left/RightArm, Left/RightForeArm) in a T-pose, in
// metres, with the ARKit blendshapes jawOpen, eyeBlinkLeft/Right and mouthSmileLeft/Right.
// With `{ clips: true }` the file also carries its own animations, named like game exports:
// "A_Idle_Breath" and "Idle_Happy" (loops, the second for a happy mood), "Emote_Wave" (a
// gesture) and "Dance_Spin" (no use, played by hand).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// The exporter reads its Blob through FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const BONES = [
  ['Hips', [0, 0.9, 0], null],
  ['Spine', [0, 0.15, 0], 'Hips'],
  ['Neck', [0, 0.45, 0], 'Spine'],
  ['Head', [0, 0.08, 0], 'Neck'],
  ['LeftArm', [0.18, 0.38, 0], 'Spine'],
  ['LeftForeArm', [0.28, 0, 0], 'LeftArm'],
  ['RightArm', [-0.18, 0.38, 0], 'Spine'],
  ['RightForeArm', [-0.28, 0, 0], 'RightArm'],
];
// Box per bone in world space: [bone, min, max].
const PARTS = [
  ['Spine', [-0.16, 0.9, -0.1], [0.16, 1.48, 0.1]],
  ['Head', [-0.12, 1.55, -0.12], [0.12, 1.82, 0.12]],
  ['LeftArm', [0.18, 1.39, -0.05], [0.46, 1.47, 0.05]],
  ['LeftForeArm', [0.46, 1.39, -0.05], [0.72, 1.47, 0.05]],
  ['RightArm', [-0.46, 1.39, -0.05], [-0.18, 1.47, 0.05]],
  ['RightForeArm', [-0.72, 1.39, -0.05], [-0.46, 1.47, 0.05]],
];
const MORPHS = ['jawOpen', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthSmileRight'];

export async function makeGlb({ clips = false } = {}) {
  const bones = new Map();
  for (const [name, position, parent] of BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.fromArray(position);
    bones.get(parent)?.add(bone);
    bones.set(name, bone);
  }
  const names = BONES.map(([name]) => name);
  const positions = [];
  const skinIndex = [];
  const skinWeight = [];
  const index = [];
  for (const [boneName, min, max] of PARTS) {
    const geometry = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const base = positions.length / 3;
    positions.push(...geometry.attributes.position.array);
    for (let i = 0; i < geometry.attributes.position.count; i += 1) {
      skinIndex.push(names.indexOf(boneName), 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    index.push(...Array.from(geometry.index.array, (i) => i + base));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // Each morph moves the head vertices a little (jawOpen the most), enough to see a change.
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = MORPHS.map((name) => {
    const delta = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] > 1.5 && positions[i + 1] < 1.6) delta[i + 1] = name === 'jawOpen' ? -0.06 : -0.01;
    }
    return new THREE.Float32BufferAttribute(delta, 3);
  });
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd8b4fe }));
  mesh.name = 'Body';
  mesh.morphTargetDictionary = Object.fromEntries(MORPHS.map((name, i) => [name, i]));
  mesh.morphTargetInfluences = MORPHS.map(() => 0);
  const root = new THREE.Group();
  root.name = 'Avatar';
  root.add(bones.get('Hips'));
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(names.map((name) => bones.get(name))));
  const animations = clips ? embeddedClips() : [];
  const result = await new GLTFExporter().parseAsync(root, { binary: true, animations });
  return Buffer.from(result);
}

/** A breathing loop on the spine and a wave of the right arm. */
function embeddedClips() {
  const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle).toArray();
  const x = new THREE.Vector3(1, 0, 0);
  const z = new THREE.Vector3(0, 0, 1);
  const idle = new THREE.AnimationClip('A_Idle_Breath', 2, [
    new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, 1, 2], [...turn(x, 0), ...turn(x, 0.04), ...turn(x, 0)]),
  ]);
  const wave = new THREE.AnimationClip('Emote_Wave', 1.2, [
    new THREE.QuaternionKeyframeTrack('RightArm.quaternion', [0, 0.4, 0.8, 1.2], [...turn(z, 0), ...turn(z, 1.2), ...turn(z, 0.8), ...turn(z, 0)]),
  ]);
  const happyIdle = new THREE.AnimationClip('Idle_Happy', 1, [
    new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 0.5, 1], [...turn(z, 0), ...turn(z, 0.1), ...turn(z, 0)]),
  ]);
  const y = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.AnimationClip('Dance_Spin', 1, [
    new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, 0.5, 1], [...turn(y, 0), ...turn(y, 0.6), ...turn(y, 0)]),
  ]);
  return [idle, wave, happyIdle, spin];
}
