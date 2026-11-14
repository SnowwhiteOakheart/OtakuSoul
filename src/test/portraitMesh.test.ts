import { describe, expect, it } from 'vitest';
import {
  createPortraitPendulum,
  deformPortraitPoint,
  stepPortraitPendulum,
} from '../components/avatar/portraitMesh';

describe('portraitMesh', () => {
  it('reacts to window movement impulses and damps back toward rest', () => {
    const pendulum = createPortraitPendulum();
    stepPortraitPendulum(pendulum, 0.25, 0, 0.016);
    expect(Math.abs(pendulum.velX)).toBeGreaterThan(0);

    for (let i = 0; i < 180; i += 1) {
      stepPortraitPendulum(pendulum, 0, 0, 0.016);
    }
    expect(Math.abs(pendulum.swayX)).toBeLessThan(0.002);
    expect(Math.abs(pendulum.velX)).toBeLessThan(0.01);
  });

  it('pins outer frame borders while deforming chest breathing, gaze parallax and mouth zone', () => {
    const corner = deformPortraitPoint(0, 0, {
      breathPhase: Math.PI / 2,
      gazeX: 1,
      gazeY: 1,
      mouthOpen: 1,
      swayX: 0.05,
      swayY: 0.02,
    });
    expect(corner).toEqual({ x: 0, y: 0 });

    const chestInhale = deformPortraitPoint(0.5, 0.72, {
      breathPhase: Math.PI / 2,
      gazeX: 0,
      gazeY: 0,
      mouthOpen: 0,
      swayX: 0,
      swayY: 0,
    });
    expect(chestInhale.y).toBeLessThan(0.72);

    const jawOpen = deformPortraitPoint(0.5, 0.45, {
      breathPhase: 0,
      gazeX: 0,
      gazeY: 0,
      mouthOpen: 0.9,
      swayX: 0,
      swayY: 0,
    });
    expect(jawOpen.y).toBeGreaterThan(0.45);
  });
});
