import { describe, expect, it } from 'vitest';
import { bodyPose, BodySway, drift, type BodyInput } from '../components/avatar/proceduralBody';
import { frameInterval } from '../components/avatar/avatarStage';

const input = (over: Partial<BodyInput> = {}): BodyInput => ({
  t: 3,
  leftArm: 1,
  rightArm: -1,
  walkPhase: null,
  sway: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  ...over,
});

describe('bodyPose', () => {
  it('keeps the drift within ±1 and changes over time', () => {
    const values = Array.from({ length: 200 }, (_, i) => drift(i * 0.37, 1.3));
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(150);
  });

  it('lowers both arms mirrored and moves them a little over time', () => {
    const now = bodyPose(input());
    const left = now.leftUpperArm!;
    const right = now.rightUpperArm!;
    // Lowered from the T-pose: about 70° around the front axis, opposite for the two sides.
    expect(left[2]).toBeLessThan(-1);
    expect(right[2]).toBeGreaterThan(1);
    const later = bodyPose(input({ t: 7 }));
    expect(later.leftUpperArm![2]).not.toBeCloseTo(left[2], 3);
  });

  it('curls the fingers towards the palm on both hands', () => {
    const pose = bodyPose(input());
    expect(pose.leftIndexIntermediate![2]).toBeLessThan(0);
    expect(pose.rightIndexIntermediate![2]).toBeGreaterThan(0);
    expect(Math.abs(pose.leftLittleProximal![2])).toBeGreaterThan(Math.abs(pose.leftIndexProximal![2]));
  });

  it('steps with alternating legs and swings each arm against its leg while walking', () => {
    const step = bodyPose(input({ walkPhase: Math.PI / 2 }));
    // Left thigh back, right thigh forward; left arm forward (against the left leg).
    expect(step.leftUpperLeg![0]).toBeGreaterThan(0);
    expect(step.rightUpperLeg![0]).toBeLessThan(0);
    expect(step.leftUpperArm![0]).toBeLessThan(step.rightUpperArm![0]);
    // The leg coming forward bends its knee.
    const swing = bodyPose(input({ walkPhase: Math.PI }));
    expect(swing.leftLowerLeg![0]).toBeGreaterThan(0.4);
    expect(swing.rightLowerLeg![0]).toBeLessThan(0.2);
  });

  it('lifts the arms when the body trails upwards (window dropping)', () => {
    const still = bodyPose(input());
    const lifted = bodyPose(input({ sway: { x: 0, y: 0.8 } }));
    expect(Math.abs(lifted.leftUpperArm![2])).toBeLessThan(Math.abs(still.leftUpperArm![2]));
    expect(Math.abs(lifted.rightUpperArm![2])).toBeLessThan(Math.abs(still.rightUpperArm![2]));
  });
});

describe('BodySway', () => {
  const run = (sway: BodySway, frames: number, dx: number, dy: number) => {
    for (let i = 0; i < frames; i += 1) sway.update(dx, dy, 1 / 30);
  };

  it('trails behind a window moving sideways and settles when it stops', () => {
    const sway = new BodySway();
    run(sway, 10, 0.03, 0);
    expect(sway.offset.x).toBeLessThan(-0.05);
    run(sway, 90, 0, 0);
    expect(Math.abs(sway.offset.x)).toBeLessThan(0.02);
  });

  it('rises while the window falls, and stays within bounds when thrown hard', () => {
    const sway = new BodySway();
    run(sway, 8, 0, 0.05);
    expect(sway.offset.y).toBeGreaterThan(0.05);
    run(sway, 5, 2, -2);
    expect(Math.abs(sway.offset.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sway.offset.y)).toBeLessThanOrEqual(1);
  });

  it('stays at rest without movement', () => {
    const sway = new BodySway();
    run(sway, 60, 0, 0);
    expect(sway.offset).toEqual({ x: 0, y: 0 });
  });
});

describe('frameInterval', () => {
  it('draws every frame at 60 and waits a little less than the period below', () => {
    expect(frameInterval(60)).toBe(0);
    expect(frameInterval(30)).toBeCloseTo(32.33, 1);
    expect(frameInterval(20)).toBe(49);
  });
});
