import { describe, expect, it } from 'vitest';
import {
  evaluateVmdBezier,
  matchVmdMorphToVrmExpression,
  MMD_VRM_BONES,
} from '../components/avatar/vmdRetarget';

describe('vmdRetarget', () => {
  it('evaluates linear and eased VMD cubic Bézier curves accurately in [0, 1]', () => {
    expect(evaluateVmdBezier(0.15, 0.15, 0.85, 0.85, 0)).toBe(0);
    expect(evaluateVmdBezier(0.15, 0.15, 0.85, 0.85, 1)).toBe(1);
    expect(evaluateVmdBezier(0.15, 0.15, 0.85, 0.85, 0.37)).toBeCloseTo(0.37, 4);

    // Ease-in-out control points start slower than linear at t=0.2 and finish faster near t=0.8.
    const easeEarly = evaluateVmdBezier(0.6, 0.05, 0.4, 0.95, 0.2);
    const easeLate = evaluateVmdBezier(0.6, 0.05, 0.4, 0.95, 0.8);
    expect(easeEarly).toBeLessThan(0.2);
    expect(easeLate).toBeGreaterThan(0.8);
  });

  it('maps Japanese MMD morph names onto non-overlapping VRM presets', () => {
    expect(matchVmdMorphToVrmExpression('あ')?.preset).toBe('aa');
    expect(matchVmdMorphToVrmExpression('まばたき')?.preset).toBe('blink');
    expect(matchVmdMorphToVrmExpression('ウィンク右')?.preset).toBe('blinkRight');
    expect(matchVmdMorphToVrmExpression('笑い')?.preset).toBe('happy');
    expect(matchVmdMorphToVrmExpression('悲しい')?.preset).toBe('sad');
    expect(matchVmdMorphToVrmExpression('unknown_morph')).toBeNull();
  });

  it('includes essential MMD to VRM humanoid and finger bones', () => {
    expect(MMD_VRM_BONES['センター']).toBe('hips');
    expect(MMD_VRM_BONES['左腕']).toBe('leftUpperArm');
    expect(MMD_VRM_BONES['右ひじ']).toBe('rightLowerArm');
    expect(MMD_VRM_BONES['左親指１']).toBe('leftThumbProximal');
  });
});
