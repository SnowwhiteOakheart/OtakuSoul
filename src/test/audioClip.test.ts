import { describe, expect, it } from 'vitest';
import { suggestClip, trimSamples, waveformPeaks } from '../utils/audioClip';

const RATE = 1_000;
const tone = (seconds: number) => Float32Array.from({ length: seconds * RATE }, (_, i) => Math.sin(i / 3) * 0.6);

describe('audioClip', () => {
  it('cuts the chosen span and fades its edges', () => {
    const clip = trimSamples(new Float32Array(10 * RATE).fill(0.5), RATE, { start: 2, end: 5 });
    expect(clip.length).toBe(3 * RATE);
    expect(clip[0]).toBe(0);
    expect(clip[clip.length - 1]).toBe(0);
    expect(clip[1_500]).toBe(0.5);
  });

  it('clamps spans outside the recording', () => {
    expect(trimSamples(new Float32Array(RATE), RATE, { start: -1, end: 9 }).length).toBe(RATE);
    expect(trimSamples(new Float32Array(RATE), RATE, { start: 0.8, end: 0.2 }).length).toBe(0);
  });

  it('takes short recordings whole', () => {
    expect(suggestClip(tone(12), RATE)).toEqual({ start: 0, end: 12 });
  });

  it('suggests the span with most speech and ends it in a pause', () => {
    // Pauses everywhere except 30–43 s, where two sentences are split by a short pause at 36 s.
    const audio = new Float32Array(60 * RATE);
    audio.set(tone(6), 30 * RATE);
    audio.set(tone(6), 36.5 * RATE);
    const { start, end } = suggestClip(audio, RATE);
    expect(start).toBeGreaterThan(28.4);
    expect(start).toBeLessThanOrEqual(30);
    expect(end).toBeGreaterThanOrEqual(42.5);
    expect(end).toBeLessThan(44.6);
  });

  it('reduces samples to one peak per bucket', () => {
    const audio = new Float32Array(100);
    audio[10] = -0.75;
    audio[70] = 0.25;
    expect(waveformPeaks(audio, 4)).toEqual([0.75, 0, 0.25, 0]);
  });
});
