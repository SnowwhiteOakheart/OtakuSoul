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

/**
 * Mouth shapes to aim for: real audio/desktop-level visemes when available, mora-timed
 * articulation for spoken chat text, multi-vowel pseudo-mora motion while speaking
 * without text cues, or closed.
 */
export function mouthTarget(voice: Visemes | null, speaking: boolean, elapsed: number): Visemes {
  if (voice) return voice;
  if (!speaking) return SILENT_VISEMES;
  if (activeTimeline) {
    const sample = sampleMoraTimeline(activeTimeline);
    if (sample) return sample;
    activeTimeline = null;
  }
  // Natural multi-vowel pseudo-mora fallback when no sentence text is active.
  const open = Math.max(0, Math.sin(elapsed * 13.5)) * 0.55 + Math.max(0, Math.sin(elapsed * 7.2 + 0.8)) * 0.2;
  const phase = (elapsed * 3.1) % 4;
  const wA = Math.max(0, Math.cos((phase - 0.3) * 1.4));
  const wO = Math.max(0, Math.cos((phase - 1.5) * 1.4));
  const wE = Math.max(0, Math.cos((phase - 2.6) * 1.4));
  const wI = Math.max(0, Math.cos((phase - 3.4) * 1.4));
  const sum = wA + wO + wE + wI || 1;
  const level = Math.min(0.85, open);
  return {
    aa: (wA / sum) * level,
    oh: (wO / sum) * level,
    ee: (wE / sum) * level,
    ih: (wI / sum) * level,
    ou: 0,
  };
}

export type VowelViseme = keyof Visemes;

export interface MoraCue {
  startMs: number;
  endMs: number;
  viseme: VowelViseme | null;
  weight: number;
}

export interface MoraTimeline {
  startedAtMs: number;
  totalMs: number;
  cues: MoraCue[];
}

interface RawMoraToken {
  viseme: VowelViseme | null;
  durationWeight: number;
  openWeight: number;
}

const KANA_VOWEL_ROWS: [string, VowelViseme][] = [
  ['あかがさざただなはばぱまやゃらわぁアカガサザタダナハバパマヤャラワァヵ', 'aa'],
  ['いきぎしじちぢにひびぴみりぃイキギシジチヂニヒビピミリィ', 'ih'],
  ['うくぐすずっつづぬふぶぷむゆゅるぅゔウクグスズッツヅヌフブプムユュルゥヴ', 'ou'],
  ['えけげせぜてでねへべぺめれぇエケゲセゼテデネヘベペメレェヶ', 'ee'],
  ['おこごそぞとどのほぼぽもよょろをぉオコゴソゾトドノホボポモヨョロヲォ', 'oh'],
];

function kanaViseme(ch: string): VowelViseme | null {
  for (const [chars, viseme] of KANA_VOWEL_ROWS) {
    if (chars.includes(ch)) return viseme;
  }
  return null;
}

function tokenizeTextToMorae(text: string): RawMoraToken[] {
  const tokens: RawMoraToken[] = [];
  const lower = text.toLowerCase();
  let i = 0;

  while (i < lower.length) {
    const ch = lower[i]!;
    const pair = lower.slice(i, i + 2);

    // Diphthongs & German umlaut combinations first.
    if (pair === 'au') {
      tokens.push({ viseme: 'aa', durationWeight: 0.75, openWeight: 0.9 });
      tokens.push({ viseme: 'ou', durationWeight: 0.65, openWeight: 0.75 });
      i += 2;
      continue;
    }
    if (pair === 'ei' || pair === 'ai' || pair === 'ey' || pair === 'ay') {
      tokens.push({ viseme: 'aa', durationWeight: 0.65, openWeight: 0.85 });
      tokens.push({ viseme: 'ih', durationWeight: 0.6, openWeight: 0.65 });
      i += 2;
      continue;
    }
    if (pair === 'eu' || pair === 'äu' || pair === 'oi' || pair === 'oy') {
      tokens.push({ viseme: 'oh', durationWeight: 0.65, openWeight: 0.8 });
      tokens.push({ viseme: 'ih', durationWeight: 0.6, openWeight: 0.65 });
      i += 2;
      continue;
    }
    if (pair === 'ie') {
      tokens.push({ viseme: 'ih', durationWeight: 1.0, openWeight: 0.72 });
      i += 2;
      continue;
    }
    if (pair === 'ae') {
      tokens.push({ viseme: 'ee', durationWeight: 0.95, openWeight: 0.78 });
      i += 2;
      continue;
    }
    if (pair === 'oe') {
      tokens.push({ viseme: 'oh', durationWeight: 0.95, openWeight: 0.76 });
      i += 2;
      continue;
    }
    if (pair === 'ue') {
      tokens.push({ viseme: 'ou', durationWeight: 0.95, openWeight: 0.72 });
      i += 2;
      continue;
    }

    if (ch === 'a' || ch === 'á' || ch === 'à' || ch === 'â') {
      tokens.push({ viseme: 'aa', durationWeight: 1.0, openWeight: 0.92 });
      i += 1;
      continue;
    }
    if (ch === 'e' || ch === 'é' || ch === 'è' || ch === 'ê' || ch === 'ä') {
      tokens.push({ viseme: 'ee', durationWeight: 0.95, openWeight: 0.78 });
      i += 1;
      continue;
    }
    if (ch === 'i' || ch === 'í' || ch === 'ì' || ch === 'î' || ch === 'y') {
      tokens.push({ viseme: 'ih', durationWeight: 0.85, openWeight: 0.68 });
      i += 1;
      continue;
    }
    if (ch === 'o' || ch === 'ó' || ch === 'ò' || ch === 'ô' || ch === 'ö') {
      tokens.push({ viseme: 'oh', durationWeight: 0.95, openWeight: 0.82 });
      i += 1;
      continue;
    }
    if (ch === 'u' || ch === 'ú' || ch === 'ù' || ch === 'û' || ch === 'ü') {
      tokens.push({ viseme: 'ou', durationWeight: 0.9, openWeight: 0.74 });
      i += 1;
      continue;
    }

    const kana = kanaViseme(ch);
    if (kana) {
      tokens.push({ viseme: kana, durationWeight: 1.0, openWeight: 0.84 });
      i += 1;
      continue;
    }
    if (ch === 'ー') {
      const prev = [...tokens].reverse().find((t) => t.viseme !== null);
      tokens.push({ viseme: prev?.viseme ?? 'aa', durationWeight: 0.8, openWeight: 0.7 });
      i += 1;
      continue;
    }
    if (ch === 'ん' || ch === 'ン') {
      tokens.push({ viseme: null, durationWeight: 0.45, openWeight: 0 });
      i += 1;
      continue;
    }

    // Bilabial consonants close the lips briefly before the following vowel.
    if (ch === 'm' || ch === 'b' || ch === 'p') {
      const prev = tokens[tokens.length - 1];
      if (!prev || prev.viseme !== null) {
        tokens.push({ viseme: null, durationWeight: 0.35, openWeight: 0 });
      }
      i += 1;
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === '。' || ch === '！' || ch === '？') {
      const prev = tokens[tokens.length - 1];
      if (prev && prev.viseme !== null) {
        tokens.push({ viseme: null, durationWeight: 1.8, openWeight: 0 });
      }
      i += 1;
      continue;
    }
    if (ch === ',' || ch === ';' || ch === ':' || ch === '、') {
      const prev = tokens[tokens.length - 1];
      if (prev && prev.viseme !== null) {
        tokens.push({ viseme: null, durationWeight: 0.95, openWeight: 0 });
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return tokens;
}

/**
 * Builds a phoneme/mora timing curve over `[0, durationMs]` from text so chat/sentence
 * bubbles without raw audio still form matching vowels and natural pauses.
 */
export function buildMoraTimeline(
  text: string,
  durationMs: number,
  startedAtMs = performance.now(),
): MoraTimeline {
  const totalMs = Math.max(250, durationMs);
  const raw = tokenizeTextToMorae(text);
  // Trim trailing pause-only cues so speaking stops cleanly on the final vowel or pause.
  const weightSum = raw.reduce((sum, token) => sum + token.durationWeight, 0);
  if (raw.length === 0 || weightSum <= 0) {
    return { startedAtMs, totalMs, cues: [] };
  }
  const cues: MoraCue[] = [];
  let cursor = 0;
  for (const token of raw) {
    const span = (token.durationWeight / weightSum) * totalMs;
    const cue: MoraCue = {
      startMs: cursor,
      endMs: cursor + span,
      viseme: token.viseme,
      weight: token.openWeight,
    };
    cues.push(cue);
    cursor += span;
  }
  if (cues.length > 0) {
    cues[cues.length - 1]!.endMs = totalMs;
  }
  return { startedAtMs, totalMs, cues };
}

/**
 * Samples a {@link MoraTimeline} at `nowMs` with coarticulation blending across adjacent cues.
 * Returns `null` before start or after the timeline finishes.
 */
export function sampleMoraTimeline(timeline: MoraTimeline, nowMs = performance.now()): Visemes | null {
  const elapsed = nowMs - timeline.startedAtMs;
  if (elapsed < 0 || elapsed > timeline.totalMs || timeline.cues.length === 0) {
    return null;
  }
  let idx = timeline.cues.findIndex((c) => elapsed >= c.startMs && elapsed <= c.endMs);
  if (idx < 0) idx = timeline.cues.length - 1;
  const cue = timeline.cues[idx]!;
  if (!cue.viseme) return { ...SILENT_VISEMES };

  const span = Math.max(1, cue.endMs - cue.startMs);
  const localT = Math.min(1, Math.max(0, (elapsed - cue.startMs) / span));
  // Rounded syllable envelope: quick opening, gentle hold, smooth taper.
  const envelope = Math.pow(Math.sin(Math.PI * localT), 0.72) * cue.weight;
  const result = { ...SILENT_VISEMES };
  let primary = 1;

  // Coarticulate smoothly with adjacent vowels at the start/end 25% of each cue.
  if (localT < 0.25 && idx > 0) {
    const prev = timeline.cues[idx - 1];
    if (prev?.viseme && prev.viseme !== cue.viseme) {
      const blend = ((0.25 - localT) / 0.25) * 0.28;
      result[prev.viseme] += blend * envelope;
      primary -= blend;
    }
  } else if (localT > 0.75 && idx + 1 < timeline.cues.length) {
    const next = timeline.cues[idx + 1];
    if (next?.viseme && next.viseme !== cue.viseme) {
      const blend = ((localT - 0.75) / 0.25) * 0.28;
      result[next.viseme] += blend * envelope;
      primary -= blend;
    }
  }

  result[cue.viseme] += Math.max(0, primary) * envelope;
  return result;
}

let activeTimeline: MoraTimeline | null = null;

export function setActiveSpeechTimeline(
  text: string,
  durationMs: number,
  startedAtMs = performance.now(),
): MoraTimeline {
  const timeline = buildMoraTimeline(text, durationMs, startedAtMs);
  activeTimeline = timeline.cues.length > 0 ? timeline : null;
  return timeline;
}

export function clearActiveSpeechTimeline(): void {
  activeTimeline = null;
}

/**
 * Turns a scalar desktop loudness level (`0…1`) from the system audio meter into natural
 * multi-vowel lip-sync weights without needing raw PCM access.
 */
export function visemesFromDesktopLevel(level: number, nowSec = performance.now() / 1000): Visemes {
  if (!Number.isFinite(level) || level < 0.02) return { ...SILENT_VISEMES };
  const clamped = Math.min(1, Math.max(0, level));
  const open = Math.min(1, Math.pow(clamped, 0.78) * 1.15);
  const phase = (nowSec * 3.4) % 4;
  const wA = Math.max(0.15, Math.cos(phase * 1.5) * 0.5 + 0.5);
  const wO = Math.max(0.05, Math.cos((phase - 1.2) * 1.5) * 0.5 + 0.5);
  const wE = Math.max(0.05, Math.cos((phase - 2.3) * 1.5) * 0.5 + 0.5);
  const wI = Math.max(0.02, Math.cos((phase - 3.1) * 1.5) * 0.4 + 0.35);
  const total = wA + wO + wE + wI;
  return {
    aa: (wA / total) * open,
    oh: (wO / total) * open,
    ee: (wE / total) * open,
    ih: (wI / total) * open,
    ou: 0,
  };
}
