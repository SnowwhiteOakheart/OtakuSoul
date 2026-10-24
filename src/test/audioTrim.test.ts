import { describe, expect, it } from 'vitest';
import { audibleRange } from '../utils/audioTrim';

const RATE = 1000;

function clip(silenceBefore: number, sound: number, silenceAfter: number): Float32Array {
  const samples = new Float32Array(silenceBefore + sound + silenceAfter);
  samples.fill(0.3, silenceBefore, silenceBefore + sound);
  return samples;
}

describe('audibleRange', () => {
  it('cuts leading and trailing silence but keeps a small margin', () => {
    // 400 ms silence, 500 ms speech, 300 ms silence; margin 30 ms.
    expect(audibleRange(clip(400, 500, 300), RATE)).toEqual([370, 930]);
  });

  it('never reaches past the clip', () => {
    expect(audibleRange(clip(10, 100, 5), RATE)).toEqual([0, 115]);
  });

  it('keeps quiet noise below the threshold out and a silent clip whole', () => {
    const noisy = clip(200, 100, 200).map((v, i) => (v === 0 ? (i % 2 ? 0.002 : -0.002) : v));
    expect(audibleRange(noisy, RATE)).toEqual([170, 330]);
    expect(audibleRange(new Float32Array(50), RATE)).toEqual([0, 50]);
  });
});
