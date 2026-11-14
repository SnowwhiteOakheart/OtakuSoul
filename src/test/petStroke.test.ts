import { describe, expect, it } from 'vitest';
import { StrokeDetector } from '../components/companion/petStroke';

/** Feeds a zig-zag along x every 50 ms; returns the times at which a stroke was reported. */
function wiggle(detector: StrokeDetector, from: number, swings: number, amplitude = 60) {
  const hits: number[] = [];
  let now = from;
  let x = 100;
  for (let i = 0; i < swings; i++) {
    const target = i % 2 === 0 ? 100 + amplitude : 100;
    while (x !== target) {
      x += Math.sign(target - x) * Math.min(20, Math.abs(target - x));
      now += 50;
      if (detector.move(x, 200, now)) hits.push(now);
    }
  }
  return hits;
}

describe('StrokeDetector', () => {
  it('a straight move is no stroke', () => {
    const d = new StrokeDetector();
    let hit = false;
    for (let i = 0; i < 40; i++) hit ||= d.move(i * 10, 100, i * 50);
    expect(hit).toBe(false);
  });

  it('wiggling back and forth is a stroke', () => {
    expect(wiggle(new StrokeDetector(), 0, 6)).toHaveLength(1);
  });

  it('tiny jitter is no stroke', () => {
    expect(wiggle(new StrokeDetector(), 0, 12, 10)).toHaveLength(0);
  });

  it('waits for a pause before the next stroke', () => {
    const d = new StrokeDetector();
    expect(wiggle(d, 0, 6)).toHaveLength(1);
    expect(wiggle(d, 1000, 6)).toHaveLength(0);
    expect(wiggle(d, 6000, 6)).toHaveLength(1);
  });

  it('a slow drift over seconds is no stroke', () => {
    const d = new StrokeDetector();
    let hit = false;
    for (let i = 0; i < 8; i++) hit ||= d.move(100 + (i % 2) * 60, 200, i * 1000);
    expect(hit).toBe(false);
  });

  it('circling counts', () => {
    const d = new StrokeDetector();
    let hits = 0;
    for (let i = 0; i < 60; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (d.move(200 + Math.cos(a) * 50, 200 + Math.sin(a) * 50, i * 50)) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });
});
