import * as THREE from 'three';

/** Bone lengths in a clip may differ this much from the model before it counts as another skeleton. */
const LENGTH_TOLERANCE = 1.33;
/** A thigh turned further than this from its rest direction in the first frame points the wrong way. */
const MAX_LEG_TURN = (100 * Math.PI) / 180;

/** The rig bones the check needs (from `findRigBones`). */
interface FitBones {
  hips?: THREE.Object3D;
  leftUpLeg?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightUpLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
}

/**
 * Whether a clip embedded in a glTF was made for this model's skeleton. Game rips often carry
 * animations of a differently built rig (other bone lengths, other axes per bone): played as they
 * are, they stretch the figure and turn its legs upwards. Such clips are left out.
 */
export function clipFitsRig(clip: THREE.AnimationClip, scene: THREE.Object3D, bones: FitBones): boolean {
  scene.updateWorldMatrix(true, true);
  const first = new Map<string, number[]>();
  for (const track of clip.tracks) first.set(track.name, Array.from(track.values.slice(0, track.getValueSize())));

  // 1. Bone lengths: positions of bones below the hips (the hips and above may move freely).
  const carriers = new Set<THREE.Object3D>();
  for (let node: THREE.Object3D | null = bones.hips ?? null; node; node = node.parent) carriers.add(node);
  const ratios: number[] = [];
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    if (propertyName !== 'position') continue;
    const node = scene.getObjectByName(nodeName);
    const rest = node?.position.length() ?? 0;
    if (!node || carriers.has(node) || rest < 0.01) continue;
    const [x = 0, y = 0, z = 0] = first.get(track.name) ?? [];
    ratios.push(Math.hypot(x, y, z) / rest);
  }
  if (ratios.length >= 3) {
    const median = ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!;
    if (median > LENGTH_TOLERANCE || median < 1 / LENGTH_TOLERANCE) return false;
  }

  // 2. Legs: in the first frame each thigh should still point roughly where it points at rest.
  const turned = new THREE.Quaternion();
  for (const [thigh, shin] of [[bones.leftUpLeg, bones.leftLeg], [bones.rightUpLeg, bones.rightLeg]] as const) {
    if (!thigh || !shin || shin.parent !== thigh) continue;
    const chain: THREE.Object3D[] = [];
    for (let node: THREE.Object3D | null = thigh; node && node !== scene; node = node.parent) chain.unshift(node);
    scene.getWorldQuaternion(turned);
    for (const node of chain) {
      const keyed = first.get(`${node.name}.quaternion`);
      turned.multiply(keyed ? new THREE.Quaternion().fromArray(keyed) : node.quaternion);
    }
    const animDirection = shin.position.clone().applyQuaternion(turned).normalize();
    const restDirection = shin.getWorldPosition(new THREE.Vector3()).sub(thigh.getWorldPosition(new THREE.Vector3())).normalize();
    if (animDirection.angleTo(restDirection) > MAX_LEG_TURN) return false;
  }
  return true;
}
