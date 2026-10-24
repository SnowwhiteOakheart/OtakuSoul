/**
 * The audible part of a clip as sample indices `[start, end)`: leading and trailing silence
 * (below `threshold`, ~-46 dBFS) is cut, keeping `marginSeconds` so word onsets and endings are
 * not clipped. Speech models pad each sentence differently; trimming keeps the pause between
 * sentences the same for every engine. A silent clip keeps its whole length.
 */
export function audibleRange(
  samples: Float32Array,
  sampleRate: number,
  threshold = 0.005,
  marginSeconds = 0.03,
): [number, number] {
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]!) > threshold) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return [0, samples.length];
  const margin = Math.round(marginSeconds * sampleRate);
  return [Math.max(0, first - margin), Math.min(samples.length, last + 1 + margin)];
}
