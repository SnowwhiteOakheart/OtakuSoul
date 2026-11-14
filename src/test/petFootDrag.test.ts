import { describe, expect, it } from 'vitest';
import { groundAngle } from '../components/avatar/hangTimeline';
import { PetBehavior, SCRAPE_GAP_MS, UPSIDE_DOWN_MS } from '../components/companion/petBehavior';

describe('groundAngle', () => {
  const hold = (footY: number, floor = 0.95, reach = 0.8) => ({ anchor: { x: 0, y: footY }, floor, reach });

  it('hangs straight down with room enough', () => {
    expect(groundAngle(hold(0.1))).toBe(0);
    // Exactly the body's length above the floor: it just touches.
    expect(groundAngle(hold(0.15))).toBeCloseTo(0, 3);
  });

  it('leans and then lies flat as the foot nears the floor', () => {
    const half = groundAngle(hold(0.55));
    expect(half).toBeCloseTo(Math.acos(0.4 / 0.8));
    expect(groundAngle(hold(0.95))).toBeCloseTo(Math.PI / 2);
    // Below the floor (pointer in the taskbar) it still only lies flat.
    expect(groundAngle(hold(1.1))).toBeCloseTo(Math.PI / 2);
    // Lower foot, flatter body.
    expect(groundAngle(hold(0.8))).toBeGreaterThan(half);
  });

  it('keeps the head above the floor', () => {
    for (const foot of [0.2, 0.4, 0.6, 0.8]) {
      const angle = groundAngle(hold(foot));
      expect(foot + 0.8 * Math.cos(angle)).toBeLessThanOrEqual(0.95 + 1e-9);
    }
  });
});

describe('PetBehavior dragged by a foot', () => {
  const feet = { grip: 'feet' as const, at: { x: 0, y: 0.9 }, anchor: { x: 0, y: 0.1 } };

  it('is cross while scraped over the floor and complains now and then', () => {
    const pet = new PetBehavior(0, () => 0);
    pet.dragStart(0, feet);
    const bubbles: string[] = [];
    let crossSeen = false;
    for (let now = 0; now <= 10_000; now += 100) {
      pet.dragAlong(now, true, true);
      const { frame, cues } = pet.tick(now);
      if (frame.expression === 'angry') crossSeen = true;
      for (const cue of cues) if (cue.kind === 'bubble') bubbles.push(cue.text);
    }
    expect(crossSeen).toBe(true);
    expect(bubbles.every((text) => text === 'scrape')).toBe(true);
    // At once, then about every SCRAPE_GAP_MS.
    expect(bubbles.length).toBe(1 + Math.floor(10_000 / SCRAPE_GAP_MS[0]));
    // Lying still it sulks.
    pet.dragAlong(11_000, true, false);
    expect(pet.tick(11_000).frame.expression).toBe('sad');
  });

  it('says once that it hangs head down', () => {
    const pet = new PetBehavior(0, () => 0);
    pet.dragStart(0, feet);
    const bubbles: string[] = [];
    for (let now = 0; now <= 3 * UPSIDE_DOWN_MS; now += 100) {
      pet.dragAlong(now, false, true);
      for (const cue of pet.tick(now).cues) if (cue.kind === 'bubble') bubbles.push(cue.text);
    }
    expect(bubbles).toEqual(['upsideDown']);
  });

  it('ignores other grips', () => {
    const pet = new PetBehavior(0, () => 0);
    pet.dragStart(0, { grip: 'shoulder', at: { x: 0, y: 0.2 }, anchor: { x: 0, y: 0.2 } });
    pet.dragAlong(0, true, true);
    const { frame, cues } = pet.tick(0);
    expect(frame.expression).toBe('surprised');
    expect(cues.some((cue) => cue.kind === 'bubble')).toBe(false);
  });
});
