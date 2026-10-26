import { describe, expect, it } from 'vitest';
import {
  bounds,
  MAX_THROW,
  stepBody,
  throwVelocity,
  usablePlatforms,
  walkArea,
  WALK_SPEED,
  type Body,
  type Platform,
} from '../components/companion/petPhysics';

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 300, height: 440 };
const floor = 1040 - 440;
const at = (x: number, y: number, support: string | null = null, edge: Body['edge'] = null): Body => ({
  x,
  y,
  vy: 0,
  support,
  edge,
});

/** Steps at 30 fps until it lands (or gives up). */
function fall(body: Body, platforms: Platform[] = []) {
  for (let i = 0; i < 120; i++) {
    const step = stepBody(body, size, area, 1 / 30, 0, 1, platforms);
    body = step.body;
    if (step.landed) return { body, landed: true };
  }
  return { body, landed: false };
}

describe('petPhysics on the floor', () => {
  it('falls from the air and lands on the floor of the work area', () => {
    const { body, landed } = fall(at(500, 100));
    expect(landed).toBe(true);
    expect(body).toMatchObject({ x: 500, y: floor, vy: 0, vx: 0, support: null });
  });

  it('stands still on the floor and snaps up when below it', () => {
    expect(stepBody(at(10, floor), size, area, 0.1, 0, 1)).toMatchObject({ grounded: true, landed: false });
    expect(stepBody(at(10, floor + 80), size, area, 0.1, 0, 1).body.y).toBe(floor);
  });

  it('walks only on the ground, scaled to the monitor', () => {
    expect(stepBody(at(500, floor), size, area, 1, 1, 2).body.x).toBe(500 + WALK_SPEED * 2);
    expect(stepBody(at(500, 0), size, area, 0.1, 1, 1).body.x).toBe(500);
  });

  it('stops at the side walls and reports which one', () => {
    const { minX, maxX } = bounds(size, area);
    expect(stepBody(at(minX + 1, floor), size, area, 1, -1, 1)).toMatchObject({ wall: -1, body: { x: minX } });
    expect(stepBody(at(maxX - 1, floor), size, area, 1, 1, 1)).toMatchObject({ wall: 1, body: { x: maxX } });
    // The window may stand a little outside, so the figure itself reaches the edge.
    expect(minX).toBeLessThan(area.x);
    expect(maxX + size.width).toBeGreaterThan(area.x + area.width);
  });

  it('uses the work area of a second monitor', () => {
    const second = { x: 1920, y: -200, width: 1280, height: 984 };
    expect(stepBody(at(2100, 900), size, second, 0.1, 0, 1).body.y).toBe(-200 + 984 - 440);
  });
});

describe('petPhysics across monitors', () => {
  // Laptop left, a taller external screen to its right, a third one far away above.
  const laptop = { x: 0, y: 0, width: 1920, height: 1040 };
  const external = { x: 1920, y: -400, width: 2560, height: 1400 };
  const away = { x: 5000, y: -2000, width: 1000, height: 800 };
  const monitors = [laptop, external, away];

  it('walks through to a monitor beside it, with the floor of the one under the feet', () => {
    const onLaptop = walkArea(monitors, 1000, laptop);
    expect(onLaptop).toEqual({ x: 0, y: 0, width: 1920 + 2560, height: 1040 });
    const onExternal = walkArea(monitors, 2500, laptop);
    expect(onExternal).toEqual({ x: 0, y: -400, width: 1920 + 2560, height: 1400 });
  });

  it('keeps the wall where no monitor continues', () => {
    expect(walkArea(monitors, 5500, laptop)).toEqual(away);
    expect(walkArea([laptop], 100, laptop)).toEqual(laptop);
  });
});

describe('petPhysics when thrown', () => {
  it('takes the speed of the last moves, clamped', () => {
    const samples = [
      { t: 0, x: 100, y: 500 },
      { t: 50, x: 150, y: 480 },
      { t: 100, x: 200, y: 460 },
    ];
    expect(throwVelocity(samples, 1)).toEqual({ vx: 1000, vy: -400 });
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }, { t: 10, x: 1000, y: 0 }], 1).vx).toBe(MAX_THROW);
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }], 1)).toEqual({ vx: 0, vy: 0 });
  });

  it('flies sideways and up, then lands and stops', () => {
    let body: Body = { ...at(500, floor), vx: 800, vy: -900 };
    let maxHeight = floor;
    let landedAt = -1;
    for (let i = 0; i < 200 && landedAt < 0; i++) {
      const step = stepBody(body, size, area, 1 / 30, 0, 1);
      body = step.body;
      maxHeight = Math.min(maxHeight, body.y);
      if (step.landed) landedAt = i;
    }
    expect(maxHeight).toBeLessThan(floor - 50);
    expect(body.x).toBeGreaterThan(600);
    expect(body).toMatchObject({ y: floor, vx: 0, vy: 0 });
  });

  it('bounces off a wall in the air', () => {
    const { maxX } = bounds(size, area);
    const step = stepBody({ ...at(maxX - 5, 100), vx: 1000 }, size, area, 1 / 30, 0, 1);
    expect(step.wall).toBe(1);
    expect(step.body.vx).toBeLessThan(0);
  });
});

describe('petPhysics on other windows', () => {
  // A window whose top edge runs from x 400 to 1400 at y 700.
  const editor: Platform = { id: 'editor', left: 400, right: 1400, y: 700 };

  it('lands on the first window edge under its feet', () => {
    const { body, landed } = fall(at(700, 0), [editor]);
    expect(landed).toBe(true);
    expect(body).toMatchObject({ y: 700 - 440, support: 'editor' });
  });

  it('lands on a title bar it was let go a little inside of', () => {
    // Feet 20 px below the top edge of the window.
    const { body } = fall(at(700, 700 + 20 - 440), [editor]);
    expect(body).toMatchObject({ y: 700 - 440, support: 'editor' });
    // Far inside the window it falls on to the floor.
    expect(fall(at(700, 700 + 120 - 440), [editor]).body).toMatchObject({ y: floor, support: null });
  });

  it('falls past a window that is not under its feet', () => {
    const { body } = fall(at(1500, 0), [editor]);
    expect(body).toMatchObject({ y: floor, support: null });
  });

  it('turns at the ends of the window instead of walking off', () => {
    // Feet (window centre) at the right end of the edge.
    const step = stepBody(at(1400 - 150 - 1, 260, 'editor'), size, area, 1, 1, 1, [editor]);
    expect(step).toMatchObject({ grounded: true, wall: 1, body: { x: 1400 - 150, y: 260, support: 'editor' } });
  });

  it('falls when the window moves or closes', () => {
    const moved = stepBody(at(700, 260, 'editor'), size, area, 1 / 30, 0, 1, [{ ...editor, y: 760 }]);
    expect(moved).toMatchObject({ grounded: false, body: { support: null } });
    const closed = stepBody(at(700, 260, 'editor'), size, area, 1 / 30, 0, 1, []);
    expect(closed.body.support).toBeNull();
  });

  it('rides along with a moved window when riding is on', () => {
    const standing = at(700, 260, 'editor', { left: 400, right: 1400, y: 700 });
    // The window went 50 px right and 80 px down.
    const moved: Platform = { id: 'editor', left: 450, right: 1450, y: 780 };
    const step = stepBody(standing, size, area, 1 / 30, 0, 1, [moved], true);
    expect(step).toMatchObject({ grounded: true, landed: false, body: { x: 750, y: 780 - 440, support: 'editor' } });
    expect(step.body.edge).toEqual({ left: 450, right: 1450, y: 780 });
    // Without riding it falls.
    expect(stepBody(standing, size, area, 1 / 30, 0, 1, [moved]).body.support).toBeNull();
  });

  it('falls off a ridden window that closes or is covered under the feet', () => {
    const standing = at(700, 260, 'editor', { left: 400, right: 1400, y: 700 });
    expect(stepBody(standing, size, area, 1 / 30, 0, 1, [], true).body.support).toBeNull();
    // Now only the left part is visible (width changed: no shift), the feet are not on it.
    const covered: Platform = { id: 'editor', left: 400, right: 600, y: 760 };
    expect(stepBody(standing, size, area, 1 / 30, 0, 1, [covered], true).body.support).toBeNull();
  });

  it('ignores window edges with no room for the figure above', () => {
    const maximised: Platform = { id: 'max', left: 0, right: 1920, y: 0 };
    const narrow: Platform = { id: 'narrow', left: 700, right: 740, y: 700 };
    expect(usablePlatforms([maximised, narrow, editor], size, area)).toEqual([editor]);
  });
});
