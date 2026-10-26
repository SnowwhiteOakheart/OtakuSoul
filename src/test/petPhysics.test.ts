import { describe, expect, it } from 'vitest';
import { bounds, stepBody, WALK_SPEED } from '../components/companion/petPhysics';

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 300, height: 440 };
const floor = 1040 - 440;

describe('petPhysics', () => {
  it('falls from the air and lands on the floor of the work area', () => {
    let body = { x: 500, y: 100, vy: 0 };
    let landedAt = -1;
    for (let i = 0; i < 120 && landedAt < 0; i++) {
      const step = stepBody(body, size, area, 1 / 30, 0, 1);
      body = step.body;
      if (step.landed) landedAt = i;
    }
    expect(landedAt).toBeGreaterThan(0);
    expect(body).toEqual({ x: 500, y: floor, vy: 0 });
  });

  it('stands still on the floor and snaps up when below it', () => {
    expect(stepBody({ x: 10, y: floor, vy: 0 }, size, area, 0.1, 0, 1)).toMatchObject({ grounded: true, landed: false });
    expect(stepBody({ x: 10, y: floor + 80, vy: 0 }, size, area, 0.1, 0, 1).body.y).toBe(floor);
  });

  it('walks only on the floor, scaled to the monitor', () => {
    const walked = stepBody({ x: 500, y: floor, vy: 0 }, size, area, 1, 1, 2);
    expect(walked.body.x).toBe(500 + WALK_SPEED * 2);
    const inAir = stepBody({ x: 500, y: 0, vy: 0 }, size, area, 0.1, 1, 1);
    expect(inAir.body.x).toBe(500);
  });

  it('stops at the side walls and reports which one', () => {
    const { minX, maxX } = bounds(size, area);
    const left = stepBody({ x: minX + 1, y: floor, vy: 0 }, size, area, 1, -1, 1);
    expect(left).toMatchObject({ wall: -1, body: { x: minX } });
    const right = stepBody({ x: maxX - 1, y: floor, vy: 0 }, size, area, 1, 1, 1);
    expect(right).toMatchObject({ wall: 1, body: { x: maxX } });
    // The window may stand a little outside, so the figure itself reaches the edge.
    expect(minX).toBeLessThan(area.x);
    expect(maxX + size.width).toBeGreaterThan(area.x + area.width);
  });

  it('uses the work area of a second monitor', () => {
    const second = { x: 1920, y: -200, width: 1280, height: 984 };
    const step = stepBody({ x: 2100, y: 900, vy: 0 }, size, second, 0.1, 0, 1);
    expect(step.body.y).toBe(-200 + 984 - 440);
  });
});
