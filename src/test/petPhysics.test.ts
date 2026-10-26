import { describe, expect, it } from 'vitest';
import { bounds, stepBody, usablePlatforms, WALK_SPEED, type Body, type Platform } from '../components/companion/petPhysics';

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 300, height: 440 };
const floor = 1040 - 440;
const at = (x: number, y: number, support: string | null = null): Body => ({ x, y, vy: 0, support });

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
    expect(body).toEqual(at(500, floor));
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

  it('ignores window edges with no room for the figure above', () => {
    const maximised: Platform = { id: 'max', left: 0, right: 1920, y: 0 };
    const narrow: Platform = { id: 'narrow', left: 700, right: 740, y: 700 };
    expect(usablePlatforms([maximised, narrow, editor], size, area)).toEqual([editor]);
  });
});
