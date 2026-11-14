import { describe, expect, it } from 'vitest';
import {
  emotionMotionCandidates,
  expressionCandidates,
  installPixiUrlPatch,
  resolveModelUrl,
  tapMotionCandidates,
} from '../components/avatar/live2dFallbacks';

describe('live2dFallbacks', () => {
  it('orders exact emotion, _animation, romance fallback, and Cubism exp/f fallbacks without duplicates', () => {
    const blush = expressionCandidates('blush');
    expect(blush.slice(0, 4)).toEqual([
      'blush',
      'blush_animation',
      'embarrassment',
      'embarrassment_animation',
    ]);
    expect(blush).toContain('exp_06');
    expect(blush).toContain('f06');
    expect(new Set(blush).size).toBe(blush.length);

    const anger = expressionCandidates('anger');
    expect(anger).toContain('exp_04');
    expect(anger).toContain('f04');
  });

  it('orders emotion and tap motion fallback groups by zone', () => {
    const head = tapMotionCandidates('head');
    expect(head[0]).toBe('TapHead');
    expect(head).toContain('mtn_02');
    expect(head[head.length - 1]).toBe('idle');

    const body = tapMotionCandidates('body');
    expect(body[0]).toBe('TapBody');
    expect(body).toContain('mtn_03');

    const motions = emotionMotionCandidates('sadness');
    expect(motions[0]).toBe('sadness');
    expect(motions).toContain('mtn_03');
  });

  it('resolves model asset URLs and installs a non-deprecated PIXI utils.url shim', () => {
    expect(resolveModelUrl('asset://localhost/models/shizuku/model.json', 'motions/idle.mtn')).toBe(
      'asset://localhost/models/shizuku/motions/idle.mtn',
    );
    expect(resolveModelUrl('https://example.com/a/b.json', 'data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc',
    );

    const utilsTarget: Record<string, unknown> = {};
    const warnings: string[] = [];
    Object.defineProperty(utilsTarget, 'url', {
      configurable: true,
      get: () => {
        warnings.push('deprecated');
        return {};
      },
    });

    const shim = installPixiUrlPatch(utilsTarget);
    const resolved = (utilsTarget.url as typeof shim).resolve('https://host/dir/model.json', '../tex/a.png');
    expect(resolved).toBe('https://host/tex/a.png');
    expect(warnings).toHaveLength(0);
  });
});
