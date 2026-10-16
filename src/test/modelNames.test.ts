import { describe, expect, it } from 'vitest';
import { modelFit, prettyModelName } from '../components/onboarding/OnboardingParts';

describe('model names for people', () => {
  it('drops extension, quantisation and dashes', () => {
    expect(prettyModelName('Ternary-Bonsai-27B-PQ2_0')).toBe('Ternary Bonsai 27B');
    expect(prettyModelName('Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf')).toBe('Gemma4 12B QAT Uncensored HauhauCS Balanced');
    expect(prettyModelName('Qwen3.8-27B-Heretic-Q4_K_M')).toBe('Qwen3.8 27B Heretic');
    expect(prettyModelName('mistral-7b-instruct.F16.gguf')).toBe('mistral 7b instruct');
  });

  it('rates how a model fits the graphics card', () => {
    const vram = 16 * 1024;
    expect(modelFit(7 * 1024, vram)).toBe('fits');
    expect(modelFit(15 * 1024, vram)).toBe('tight');
    expect(modelFit(24 * 1024, vram)).toBe('too_big');
  });
});
