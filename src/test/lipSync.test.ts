import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMoraTimeline,
  clearActiveSpeechTimeline,
  estimateVisemes,
  mouthTarget,
  sampleMoraTimeline,
  setActiveSpeechTimeline,
  visemesFromDesktopLevel,
  type Visemes,
} from '../services/lipSync';

/** A voiced vowel: harmonics of 200 Hz under formant peaks at f1 and f2 (48 kHz, 1024 FFT). */
const vowel = (f1: number, f2: number) => {
  const binHz = 48_000 / 1024;
  const data = new Uint8Array(512);
  for (let i = 0; i < data.length; i += 1) {
    const hz = i * binHz;
    const harmonic = Math.abs(((hz + 100) % 200) - 100) < binHz ? 1 : 0.35;
    const formant = Math.exp(-(((hz - f1) / 120) ** 2)) + 0.8 * Math.exp(-(((hz - f2) / 180) ** 2));
    data[i] = Math.min(255, Math.round(255 * formant * harmonic));
  }
  return { data, binHz };
};
const strongest = (v: Visemes) => (Object.entries(v) as [keyof Visemes, number][]).sort((a, b) => b[1] - a[1])[0]![0];

describe('estimateVisemes', () => {
  it.each([
    ['aa', 820, 1300],
    ['ih', 300, 2500],
    ['ou', 350, 1050],
    ['ee', 480, 2050],
    ['oh', 520, 850],
  ] as const)('recognises %s', (expected, f1, f2) => {
    const { data, binHz } = vowel(f1, f2);
    expect(strongest(estimateVisemes(data, binHz, 0.8))).toBe(expected);
  });

  it('weights add up to the loudness and silence closes the mouth', () => {
    const { data, binHz } = vowel(800, 1300);
    const sum = Object.values(estimateVisemes(data, binHz, 0.5)).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0.5);
    expect(Object.values(estimateVisemes(data, binHz, 0)).every((v) => v === 0)).toBe(true);
  });
});

describe('mora timeline lip-sync', () => {
  afterEach(() => {
    clearActiveSpeechTimeline();
  });

  it('builds Japanese & German vowel cues with pauses and samples matching visemes', () => {
    const timeline = buildMoraTimeline('Hallo, ありがとう.', 1200, 100);
    expect(timeline.cues.length).toBeGreaterThanOrEqual(6);
    const firstVowel = timeline.cues.find((c) => c.viseme === 'aa');
    expect(firstVowel).toBeDefined();
    const mid = (firstVowel!.startMs + firstVowel!.endMs) / 2;
    const sampled = sampleMoraTimeline(timeline, 100 + mid)!;
    expect(sampled.aa).toBeGreaterThan(0.4);
    expect(sampleMoraTimeline(timeline, 1301)).toBeNull();
  });

  it('activates mora timelines inside mouthTarget and clears on command', () => {
    setActiveSpeechTimeline('oooo', 1000, performance.now());
    const v = mouthTarget(null, true, 0);
    expect(v.oh).toBeGreaterThan(0);
    clearActiveSpeechTimeline();
    expect(mouthTarget(null, false, 1).aa).toBe(0);
  });
});

describe('visemesFromDesktopLevel', () => {
  it('closes the mouth below threshold and scales weights smoothly with level', () => {
    const silent = visemesFromDesktopLevel(0.01, 1);
    expect(Object.values(silent).every((v) => v === 0)).toBe(true);

    const loud = visemesFromDesktopLevel(0.7, 2.5);
    const sum = Object.values(loud).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0.5);
    expect(sum).toBeLessThanOrEqual(1);
  });
});
