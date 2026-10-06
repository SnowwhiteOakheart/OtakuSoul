import { describe, expect, it } from 'vitest';
import { encodeWav, hasEffects, NO_EFFECTS, pitchShift, timeStretch, VOICE_EFFECT_PRESETS } from '../services/voiceEffects';

const RATE = 16_000;
const sine = (hz: number, seconds: number) =>
  Float32Array.from({ length: RATE * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE) * 0.5);

/** Dominant frequency from upward zero crossings in the middle of the clip (edges fade). */
const frequency = (samples: Float32Array) => {
  const from = Math.floor(samples.length * 0.2);
  const to = Math.floor(samples.length * 0.8);
  let crossings = 0;
  for (let i = from + 1; i < to; i += 1) if (samples[i - 1]! < 0 && samples[i]! >= 0) crossings += 1;
  return crossings / ((to - from) / RATE);
};

describe('voice effects', () => {
  it('stretches time without changing the pitch', () => {
    const input = sine(220, 1);
    const longer = timeStretch(input, 1.5, RATE);
    expect(longer.length).toBe(Math.round(input.length * 1.5));
    expect(frequency(longer)).toBeGreaterThan(205);
    expect(frequency(longer)).toBeLessThan(235);
  });

  it('shifts the pitch by semitones and keeps the length', () => {
    const input = sine(220, 1);
    const octaveUp = pitchShift(input, 12, RATE);
    const down = pitchShift(input, -5, RATE);
    expect(octaveUp.length).toBe(input.length);
    expect(frequency(octaveUp)).toBeGreaterThan(420);
    expect(frequency(octaveUp)).toBeLessThan(460);
    expect(frequency(down)).toBeGreaterThan(155); // 220 × 2^(−5/12) ≈ 165 Hz
    expect(frequency(down)).toBeLessThan(175);
  });

  it('encodes a playable 16-bit mono WAV', () => {
    const url = encodeWav(Float32Array.from([0, 0.5, -0.5, 1]), RATE);
    const bytes = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(Math.trunc(0.5 * 0x7fff));
  });

  it('treats only real effect values as effects', () => {
    expect(hasEffects(null)).toBe(false);
    expect(hasEffects(NO_EFFECTS)).toBe(false);
    for (const [id, values] of Object.entries(VOICE_EFFECT_PRESETS)) expect(hasEffects({ ...values, preset: id })).toBe(true);
  });
});
