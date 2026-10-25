/** Range of the "VAD sensitivity" slider in the voice settings. */
export const VAD_MIN = 0.005;
export const VAD_MAX = 0.12;

/** What the microphone check measured during one recording (raw RMS levels, 0–1). */
export interface MicCheckStats {
  /** Loudest frame. */
  peak: number;
  /** Quietest frame after the first half second (background noise). */
  floor: number;
  /** Whether a frame reached the threshold. */
  speechDetected: boolean;
  /** Whether the recording ended by itself after a pause (instead of by the time limit or by hand). */
  endedBySilence: boolean;
}

export type MicCheckVerdict =
  | { kind: 'silent' }
  | { kind: 'tooQuiet'; suggested: number }
  | { kind: 'tooNoisy'; suggested: number }
  | { kind: 'ok' };

/** Rounds to the slider step (0.005) and keeps the value inside the slider. */
export function clampThreshold(value: number) {
  const stepped = Math.round(value / 0.005) * 0.005;
  return Math.min(VAD_MAX, Math.max(VAD_MIN, Number(stepped.toFixed(3))));
}

/** Converts the level `VoiceCapture` reports (scaled to 4× the threshold, capped at 1) back to RMS. */
export function rawLevel(reported: number, threshold: number) {
  return reported * Math.max(threshold * 4, 0.01);
}

/**
 * Judges a recording of the microphone check: nothing at all (wrong or muted microphone),
 * speech below the threshold (threshold too high), background noise above it (the pause is
 * never detected), or fine. Suggestions sit between the background noise and the voice.
 */
export function judgeMicCheck(stats: MicCheckStats, threshold: number): MicCheckVerdict {
  if (stats.peak < 0.002) return { kind: 'silent' };
  if (!stats.speechDetected) return { kind: 'tooQuiet', suggested: clampThreshold(stats.peak * 0.5) };
  if (!stats.endedBySilence && stats.floor >= threshold) {
    const between = Math.max(stats.floor * 1.5, (stats.floor + stats.peak) / 2);
    return { kind: 'tooNoisy', suggested: clampThreshold(Math.min(stats.peak * 0.8, between)) };
  }
  return { kind: 'ok' };
}
