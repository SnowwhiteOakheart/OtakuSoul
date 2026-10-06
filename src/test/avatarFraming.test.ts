import { describe, expect, it } from 'vitest';
import { frameUpperBody } from '../services/avatarViewState';

describe('frameUpperBody', () => {
  const visibleTop = (view: ReturnType<typeof frameUpperBody>, fov: number) =>
    view.target[1] + view.camera[2] * Math.tan((fov * Math.PI) / 360);

  it('keeps the top of a tall model in view', () => {
    const view = frameUpperBody(1.55, 1.72, 32, 1);
    expect(visibleTop(view, 32)).toBeGreaterThan(1.72);
    expect(view.target[1]).toBeCloseTo(1.43);
  });

  it('backs off in narrow portrait columns so the face and shoulders fit', () => {
    const wide = frameUpperBody(1.4, 1.55, 32, 1.2);
    const narrow = frameUpperBody(1.4, 1.55, 32, 0.45);
    expect(narrow.camera[2]).toBeGreaterThan(wide.camera[2]);
    expect(narrow.camera[2] * Math.tan((32 * Math.PI) / 360) * 0.45).toBeGreaterThanOrEqual(0.18 - 1e-9);
  });

  it('stays within the orbit limits', () => {
    expect(frameUpperBody(1.4, 3, 32, 0.05).camera[2]).toBeLessThanOrEqual(2.4);
    expect(frameUpperBody(0.5, 0.55, 90, 3).camera[2]).toBeGreaterThanOrEqual(0.6);
  });
});
