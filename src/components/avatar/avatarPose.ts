import * as THREE from 'three';

/**
 * The upper arm rotated so it hangs down beside the body, whatever the model's bind pose
 * (T- or A-pose). Computed once from the bind pose; local to the bone. `side` is +1 for the
 * character's left arm (at +X when it faces +Z), -1 for the right.
 */
export function loweredArm(arm: THREE.Object3D, elbow: THREE.Object3D, side: 1 | -1): THREE.Quaternion {
  const from = arm.getWorldPosition(new THREE.Vector3());
  const direction = elbow.getWorldPosition(new THREE.Vector3()).sub(from).normalize();
  const target = new THREE.Vector3(0.28 * side, -1, 0.06).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(direction, target);
  const parent = arm.parent ? arm.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  return parent.clone().invert().multiply(turn).multiply(parent).multiply(arm.quaternion);
}
