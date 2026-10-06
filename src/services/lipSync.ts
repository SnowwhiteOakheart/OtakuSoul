/** Mouth shapes of VRM (Japanese vowels a, i, u, e, o). */
export interface Visemes {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export const SILENT_VISEMES: Visemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

/** Typical first and second formants (Hz) of each vowel, between female and male voices. */
const VOWELS: [keyof Visemes, number, number][] = [
  ['aa', 800, 1300],
  ['ih', 320, 2400],
  ['ou', 360, 1100],
  ['ee', 500, 2000],
  ['oh', 520, 880],
];

/**
 * Guesses the mouth shape from one spectrum frame (`getByteFrequencyData`): it finds the
 * first two formants in the smoothed spectrum and weights each vowel by its distance to
 * them. The weights add up to `loudness`, so quiet sounds keep the mouth nearly closed.
 */
export function estimateVisemes(spectrum: ArrayLike<number>, binHz: number, loudness: number): Visemes {
  if (loudness < 0.02 || spectrum.length === 0) return { ...SILENT_VISEMES };
  // Smoothing over ~250 Hz turns the voice harmonics into a formant envelope.
  const radius = Math.max(1, Math.round(125 / binHz));
  const envelope = (bin: number) => {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, bin - radius); i <= Math.min(spectrum.length - 1, bin + radius); i += 1) {
      sum += spectrum[i]!;
      count += 1;
    }
    return count ? sum / count : 0;
  };
  const peak = (fromHz: number, toHz: number) => {
    let best = Math.round(fromHz / binHz);
    let bestValue = -1;
    for (let bin = Math.round(fromHz / binHz); bin <= Math.min(spectrum.length - 1, Math.round(toHz / binHz)); bin += 1) {
      const value = envelope(bin);
      if (value > bestValue) {
        bestValue = value;
        best = bin;
      }
    }
    return { hz: best * binHz, value: bestValue };
  };
  const f1 = peak(250, 1000);
  const f2 = peak(Math.max(f1.hz + 250, 700), 3000);
  // Fricatives and breath: hardly any formant structure, the mouth stays almost closed.
  const voiced = f1.value > 8 ? 1 : 0.3;

  const scores = VOWELS.map(([, v1, v2]) => {
    const distance = ((f1.hz - v1) / 220) ** 2 + ((f2.hz - v2) / 450) ** 2;
    return Math.exp(-distance / 2);
  });
  const total = scores.reduce((a, b) => a + b, 0) || 1;
  const open = Math.min(1, loudness) * voiced;
  const result = { ...SILENT_VISEMES };
  VOWELS.forEach(([key], i) => {
    result[key] = (scores[i]! / total) * open;
  });
  return result;
}
