import { describe, expect, it } from 'vitest';
import { RAGDOLL_S, RECOVER_PHASES, recoverClock, recoverTotal } from '../components/avatar/hangTimeline';
import { PetBehavior } from '../components/companion/petBehavior';
import { hinge, JOINTS, length, Ragdoll, type JointName, type RagdollSetup, type V3 } from '../components/avatar/ragdoll';

/** A 1.5 m figure standing upright at the origin, facing +z. */
function standing(lift = 0, velocity: V3 = { x: 0, y: 0, z: 0 }): RagdollSetup {
  const j = (x: number, y: number): V3 => ({ x, y: y + lift, z: 0 });
  const joints: Record<JointName, V3> = {
    hips: j(0, 0.8), chest: j(0, 1.05), neck: j(0, 1.3), headTop: j(0, 1.5),
    lShoulder: j(0.17, 1.25), rShoulder: j(-0.17, 1.25), lHip: j(0.09, 0.78), rHip: j(-0.09, 0.78),
    lHand: j(0.22, 0.75), rHand: j(-0.22, 0.75), lFoot: j(0.1, 0.05), rFoot: j(-0.1, 0.05),
  };
  return { joints, velocity, floor: 0, height: 1.5, arm: [0.27, 0.25], leg: [0.38, 0.36] };
}

const distance = (a: V3, b: V3) => length({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

describe('pet ragdoll', () => {
  it('bends hinges the right way', () => {
    const knee = hinge({ x: 0, y: 1, z: 0 }, { x: 0, y: 0.4, z: 0 }, 0.38, 0.36, { x: 0, y: 0, z: 1 });
    expect(knee.z).toBeGreaterThan(0.1);
    expect(distance(knee, { x: 0, y: 1, z: 0 })).toBeCloseTo(0.38, 5);
  });

  it('collapses onto the floor when dropped, keeps its proportions and comes to rest', () => {
    const doll = new Ragdoll(standing(0.6, { x: 0.8, y: -2, z: 0 }));
    const trunk = distance(doll.pos.hips, doll.pos.neck);
    for (let i = 0; i < 120; i++) doll.step(1 / 60);
    for (const name of JOINTS) expect(doll.pos[name].y).toBeGreaterThanOrEqual(-1e-6);
    expect(distance(doll.pos.hips, doll.pos.neck)).toBeCloseTo(trunk, 2);
    // Fallen down: the head is far below where it started.
    expect(doll.pos.headTop.y).toBeLessThan(1);
    expect(doll.speed()).toBeLessThan(0.5);
    expect(distance(doll.pos.lShoulder, doll.pos.lHand)).toBeLessThanOrEqual(0.52 + 1e-3);
  });

  it('stays finite with a hard throw', () => {
    const doll = new Ragdoll(standing(1.2, { x: 6, y: -8, z: 0 }));
    for (let i = 0; i < 200; i++) doll.step(1 / 30);
    for (const name of JOINTS) {
      expect(Number.isFinite(doll.pos[name].x)).toBe(true);
      expect(Math.abs(doll.pos[name].z)).toBeLessThan(0.4);
    }
    expect(doll.knee('l').y).toBeGreaterThanOrEqual(0);
  });
});


describe('ragdoll fall before getting up', () => {
  it('holds the scripted timeline while it falls, then goes on from pushing itself up', () => {
    const fall = { kind: 'head' as const, ragdoll: { down: 2, side: 0 } };
    const p = RECOVER_PHASES.head;
    expect(recoverClock(fall, 0.5)).toBeLessThan(p.impact);
    expect(recoverClock(fall, RAGDOLL_S)).toBeCloseTo(p.settle, 5);
    expect(recoverTotal(fall)).toBeCloseTo(RAGDOLL_S + p.total - p.settle, 5);
    // Without it, or landing on the feet, nothing changes.
    expect(recoverClock({ kind: 'head', ragdoll: null }, 0.5)).toBe(0.5);
    expect(recoverClock({ kind: 'feet', ragdoll: { down: 1, side: 0 } }, 0.5)).toBe(0.5);
  });

  it('hands the landing speed to the viewer in window heights and waits longer', () => {
    const pet = new PetBehavior(0, () => 0.5);
    pet.setPhysics(true);
    pet.setFloorSit(true);
    pet.setRagdoll(true);
    pet.setGrounded(true, 0);
    pet.tick(0);
    pet.dragStart(100, { grip: 'feet', at: { x: 0, y: 0.9 }, anchor: { x: 0, y: 0.12 } });
    pet.dragEnd(200);
    pet.setGrounded(false, 210);
    pet.setGrounded(true, 900, { down: 880, side: -440, height: 440 });
    const recover = pet.tick(950).frame.recover;
    expect(recover?.ragdoll).toEqual({ down: 2, side: -1 });
    // Still getting up after the scripted time alone would be over.
    expect(pet.tick(900 + RECOVER_PHASES.head.total * 1000 + 100).frame.recover).not.toBeNull();
    expect(pet.tick(900 + recoverTotal(recover!) * 1000 + 100).frame.recover).toBeNull();
  });
});
