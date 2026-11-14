import { describe, expect, it } from 'vitest';
import { swingStep, SWING_LIMIT, TOPPLE_KICK, type Swing } from '../components/avatar/hangTimeline';

const DT = 1 / 60;
/** Runs the pendulum for `seconds` with the hand's acceleration from `accel(t)`; returns the angles. */
function run(
  swing: Swing,
  seconds: number,
  accel: (t: number) => { x: number; y: number } = () => ({ x: 0, y: 0 }),
  length = 0.4,
  velocity: (t: number) => number = () => 0,
) {
  const angles: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    swingStep(swing, accel(t), { x: velocity(t) }, length, DT);
    angles.push(swing.angle);
  }
  return angles;
}

describe('hanging pendulum', () => {
  it('topples from head-up (held by the feet) and comes to hang still below the grip', () => {
    const swing: Swing = { angle: Math.PI - 0.12, speed: -TOPPLE_KICK, hanging: false };
    const angles = run(swing, 5);
    // Down within a second, then only small swings, still after a few seconds.
    expect(Math.abs(angles[Math.round(1.2 / DT)]!)).toBeLessThanOrEqual(SWING_LIMIT + 1e-9);
    expect(Math.abs(swing.angle)).toBeLessThan(0.1);
    expect(swing.hanging).toBe(true);
  });

  it('swings out against the hand and never beyond 45°', () => {
    const swing: Swing = { angle: 0, speed: 0, hanging: true };
    // The hand jerks right and left for two seconds.
    const angles = run(swing, 2, (t) => ({ x: Math.sin(t * 6) * 60, y: 0 }));
    expect(angles[5]!).toBeLessThan(0);
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(SWING_LIMIT + 1e-9);
    expect(Math.max(...angles.map(Math.abs))).toBeGreaterThan(0.3);
  });

  it('carried steadily to the right, the body trails behind on the left', () => {
    const swing: Swing = { angle: 0, speed: 0, hanging: true };
    // Speeds up to 2 window heights/s within a quarter second, then keeps going.
    const accel = (t: number) => ({ x: t < 0.25 ? 8 : 0, y: 0 });
    const velocity = (t: number) => Math.min(2, t * 8);
    const angles = run(swing, 4, accel, 0.4, velocity);
    // Counter-clockwise is positive: the body's bottom is to the right; trailing left is negative.
    expect(angles[10]!).toBeLessThan(0);
    expect(swing.angle).toBeLessThan(-0.25);
    expect(swing.angle).toBeGreaterThan(-SWING_LIMIT - 1e-9);
  });

  it('toppled the other way round (a whole turn off) it still hangs straight, not stuck at the limit', () => {
    const swing: Swing = { angle: -2 * Math.PI + 0.1, speed: 0, hanging: true };
    run(swing, 4);
    expect(Math.abs(swing.angle)).toBeLessThan(0.1);
  });

  it('swings slower on a longer pendulum (held by the feet) than a short one (by the collar)', () => {
    const crossings = (length: number) => {
      const angles = run({ angle: 0.5, speed: 0, hanging: true }, 4, undefined, length);
      return angles.filter((a, i) => i > 0 && Math.sign(a) !== Math.sign(angles[i - 1]!)).length;
    };
    expect(crossings(0.6)).toBeLessThan(crossings(0.2));
  });
});
