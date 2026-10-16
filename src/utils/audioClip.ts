/**
 * Cutting a voice reference out of a longer recording: the chosen span with short fades (no clicks
 * at the cut), a suggestion for the best span and peaks for drawing the waveform.
 */

export interface ClipRange {
  /** Start in seconds. */
  start: number;
  /** End in seconds. */
  end: number;
}

/** Length the suggestion aims for (voice cloning works best with 10–15 s). */
export const SUGGESTED_CLIP_SECS = 12;
const FRAME_SECS = 0.04;
const FADE_IN_SECS = 0.05;
const FADE_OUT_SECS = 0.08;

/** The samples between `start` and `end`, faded in and out. */
export function trimSamples(samples: Float32Array, rate: number, range: ClipRange): Float32Array {
  const from = Math.max(0, Math.min(samples.length, Math.round(range.start * rate)));
  const to = Math.max(from, Math.min(samples.length, Math.round(range.end * rate)));
  const clip = samples.slice(from, to);
  const fadeIn = Math.min(clip.length, Math.round(FADE_IN_SECS * rate));
  const fadeOut = Math.min(clip.length, Math.round(FADE_OUT_SECS * rate));
  for (let i = 0; i < fadeIn; i += 1) clip[i]! *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) clip[clip.length - 1 - i]! *= i / fadeOut;
  return clip;
}

/** Loudness (RMS) per 40 ms frame. */
function frameEnergy(samples: Float32Array, rate: number): Float32Array {
  const size = Math.max(1, Math.round(FRAME_SECS * rate));
  const frames = new Float32Array(Math.ceil(samples.length / size));
  for (let f = 0; f < frames.length; f += 1) {
    let sum = 0;
    const end = Math.min(samples.length, (f + 1) * size);
    for (let i = f * size; i < end; i += 1) sum += samples[i]! * samples[i]!;
    frames[f] = Math.sqrt(sum / Math.max(1, end - f * size));
  }
  return frames;
}

/**
 * The span of about [`SUGGESTED_CLIP_SECS`] with the most speech, its edges moved into the nearest
 * pause (up to 1.5 s), so it neither starts nor ends in the middle of a word. Recordings that are
 * short enough are taken whole.
 */
export function suggestClip(samples: Float32Array, rate: number, target = SUGGESTED_CLIP_SECS): ClipRange {
  const duration = samples.length / rate;
  if (duration <= target + 3) return { start: 0, end: duration };
  const energy = frameEnergy(samples, rate);
  const sorted = [...energy].sort((a, b) => a - b);
  // Speech: clearly above the quiet floor of the recording.
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const peak = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const threshold = floor + (peak - floor) * 0.15;
  const voiced = energy.map((e) => (e > threshold ? 1 : 0));
  const window = Math.round(target / FRAME_SECS);
  let count = 0;
  for (let i = 0; i < window; i += 1) count += voiced[i]!;
  let best = count;
  let bestStart = 0;
  for (let i = window; i < voiced.length; i += 1) {
    count += voiced[i]! - voiced[i - window]!;
    if (count > best) {
      best = count;
      bestStart = i - window + 1;
    }
  }
  // Quietest frame near an edge (pauses between sentences).
  const reach = Math.round(1.5 / FRAME_SECS);
  const quietest = (around: number) => {
    let at = around;
    for (let i = Math.max(0, around - reach); i <= Math.min(energy.length - 1, around + reach); i += 1) {
      if (energy[i]! < energy[at]!) at = i;
    }
    return at;
  };
  const start = quietest(bestStart);
  const end = Math.max(start + 1, quietest(Math.min(energy.length - 1, bestStart + window)));
  return { start: start * FRAME_SECS, end: Math.min(duration, (end + 1) * FRAME_SECS) };
}

/** Highest absolute value in each of `buckets` equal slices (for the waveform). */
export function waveformPeaks(samples: Float32Array, buckets: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b += 1) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i += 1) max = Math.max(max, Math.abs(samples[i]!));
    peaks.push(max);
  }
  return peaks;
}
