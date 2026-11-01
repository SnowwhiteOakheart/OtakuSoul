import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { reachWithArm } from '../components/avatar/armReach';

/** A T-pose arm along `side` (±X), in a body turned `facing` round the vertical axis. */
function arm(side: 1 | -1, facing: number) {
  const body = new THREE.Object3D();
  body.rotation.y = facing;
  const upper = new THREE.Object3D();
  upper.position.set(side * 0.2, 1.3, 0);
  const lower = new THREE.Object3D();
  lower.position.set(side * 0.27, 0, 0);
  const hand = new THREE.Object3D();
  hand.position.set(side * 0.24, 0, 0);
  body.add(upper);
  upper.add(lower);
  lower.add(hand);
  // Hanging down a little bent, as the procedural pose leaves it.
  upper.rotation.z = -side * 1.2;
  lower.rotation.y = -side * 0.4;
  body.updateMatrixWorld(true);
  return { body, upper, lower, hand };
}

describe('reachWithArm', () => {
  it('brings the wrist to a point within reach, on either rig and side', () => {
    for (const facing of [0, Math.PI]) {
      for (const side of [1, -1] as const) {
        const { body, upper, lower, hand } = arm(side, facing);
        // In front of the body and below the shoulder (front = +Z of the body).
        const target = body.localToWorld(new THREE.Vector3(side * 0.12, 0.95, 0.3));
        reachWithArm(upper, lower, hand, target);
        expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(0.01);
      }
    }
  });

  it('stretches towards a point out of reach without breaking the chain', () => {
    const { upper, lower, hand } = arm(1, 0);
    const target = new THREE.Vector3(0.2, 1.3, 2);
    reachWithArm(upper, lower, hand, target, 20);
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    expect(wrist.distanceTo(shoulder)).toBeCloseTo(0.51, 2);
    // Fully stretched straight towards it.
    expect(wrist.z).toBeGreaterThan(0.49);
  });
});
