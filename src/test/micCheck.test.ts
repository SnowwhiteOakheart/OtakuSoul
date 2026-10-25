import { describe, expect, it } from 'vitest';
import { clampThreshold, judgeMicCheck, rawLevel, VAD_MAX, VAD_MIN } from '../utils/micCheck';

const base = { peak: 0.1, floor: 0.005, speechDetected: true, endedBySilence: true };

describe('micCheck', () => {
  it('turns the reported level back into RMS', () => {
    expect(rawLevel(0.25, 0.025)).toBeCloseTo(0.025);
    expect(rawLevel(1, 0.001)).toBeCloseTo(0.01);
  });

  it('keeps suggestions on the slider', () => {
    expect(clampThreshold(0.0001)).toBe(VAD_MIN);
    expect(clampThreshold(0.5)).toBe(VAD_MAX);
    expect(clampThreshold(0.0312)).toBe(0.03);
  });

  it('accepts a normal recording', () => {
    expect(judgeMicCheck(base, 0.025)).toEqual({ kind: 'ok' });
  });

  it('reports a dead microphone', () => {
    expect(judgeMicCheck({ ...base, peak: 0.001, floor: 0.001, speechDetected: false, endedBySilence: false }, 0.025))
      .toEqual({ kind: 'silent' });
  });

  it('suggests a lower threshold when the voice stayed below it', () => {
    const verdict = judgeMicCheck({ ...base, peak: 0.03, speechDetected: false, endedBySilence: false }, 0.06);
    expect(verdict).toEqual({ kind: 'tooQuiet', suggested: 0.015 });
  });

  it('suggests a higher threshold, still below the voice, when noise hides the pause', () => {
    const verdict = judgeMicCheck({ ...base, peak: 0.1, floor: 0.03, endedBySilence: false }, 0.025);
    expect(verdict.kind).toBe('tooNoisy');
    if (verdict.kind !== 'tooNoisy') return;
    expect(verdict.suggested).toBeGreaterThan(0.03);
    expect(verdict.suggested).toBeLessThan(0.1);
  });
});
