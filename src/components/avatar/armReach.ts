import * as THREE from 'three';

const jointAt = new THREE.Vector3();
const handAt = new THREE.Vector3();
const toHand = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const turn = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();

/**
 * Turns an arm (upper arm, then forearm; `hand` is the wrist at the chain's end) so the wrist
 * comes as close to `target` (world space) as the arm allows: cyclic coordinate descent, a few
 * rounds from the current pose. Works on any rig, whichever way its bones point, as it only
 * turns each joint so its line to the wrist faces the target. The current pose is the start, so
 * the elbow keeps bending the way it already bends.
 */
export function reachWithArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, rounds = 8) {
  for (let round = 0; round < rounds; round++) {
    for (const joint of [lower, upper]) {
      joint.updateWorldMatrix(true, true);
      joint.getWorldPosition(jointAt);
      hand.getWorldPosition(handAt);
      toHand.subVectors(handAt, jointAt);
      toTarget.subVectors(target, jointAt);
      if (toHand.lengthSq() < 1e-10 || toTarget.lengthSq() < 1e-10) continue;
      // The turn in world space, moved into the joint's own space (through its parent).
      turn.setFromUnitVectors(toHand.normalize(), toTarget.normalize());
      if (joint.parent) joint.parent.getWorldQuaternion(parentTurn);
      else parentTurn.identity();
      joint.quaternion.premultiply(parentTurn.clone().invert().multiply(turn).multiply(parentTurn));
    }
    hand.updateWorldMatrix(true, false);
    if (hand.getWorldPosition(handAt).distanceToSquared(target) < 1e-6) break;
  }
  upper.updateWorldMatrix(false, true);
}
