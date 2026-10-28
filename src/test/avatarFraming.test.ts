import { describe, expect, it } from 'vitest';
import { frameFullBody, frameUpperBody, PET_FEET_SHARE } from '../services/avatarViewState';

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

describe('frameFullBody (desktop pet)', () => {
  const FOV = 32;
  const ASPECT = 300 / 440;
  const half = (view: ReturnType<typeof frameFullBody>) => view.camera[2] * Math.tan((FOV * Math.PI) / 360);
  /** Where y = 0 (the feet) shows, as share of the window height from the bottom. */
  const feetShare = (view: ReturnType<typeof frameFullBody>) => (0 - (view.target[1] - half(view))) / (2 * half(view));
  const topShare = (view: ReturnType<typeof frameFullBody>, topY: number) =>
    (topY - (view.target[1] - half(view))) / (2 * half(view));

  it('shows the whole figure with the top fifth free', () => {
    const view = frameFullBody(1.6, FOV, ASPECT);
    expect(feetShare(view)).toBeCloseTo(PET_FEET_SHARE);
    expect(topShare(view, 1.6)).toBeCloseTo(0.8, 2);
  });

  it('zooms around the feet: they stay where they stand, the figure grows', () => {
    const view = frameFullBody(1.6, FOV, ASPECT, { zoom: 1.5, lift: 0 });
    expect(feetShare(view)).toBeCloseTo(PET_FEET_SHARE);
    expect(topShare(view, 1.6)).toBeGreaterThan(1);
    expect(half(view)).toBeCloseTo(half(frameFullBody(1.6, FOV, ASPECT)) / 1.5);
  });

  it('lifts the feet by a share of the window', () => {
    const view = frameFullBody(1.6, FOV, ASPECT, { zoom: 1, lift: 0.1 });
    expect(feetShare(view)).toBeCloseTo(PET_FEET_SHARE + 0.1);
  });
});
