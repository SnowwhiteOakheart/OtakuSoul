import type { ImageModelInfo, StarterModel, TtsModelInfo } from '../types';

/** Graphics memory kept free for the desktop and the driver (as the model catalog does). */
export const DESKTOP_RESERVE_MB = 1536;

/**
 * Speech models from best to plainest for a first setup: built-in voices, no clone or description
 * needed. Qwen3-TTS 1.7B speaks with feeling (style per sentence), Kokoro is tiny but German only.
 */
const TTS_ORDER = ['qwen3-tts-customvoice-1.7b', 'qwen3-tts-customvoice-0.6b', 'chatterbox-multilingual', 'kokoro-de', 'chatterbox-turbo'];

/** Speech models a beginner can use right away in `language`. */
export function ttsCandidates(models: TtsModelInfo[], language: string): TtsModelInfo[] {
  return models
    .filter((m) => m.allowed && !m.needs_clone && !m.voice_design && m.voices.length > 0 && m.languages.includes(language))
    .sort((a, b) => rank(a.id) - rank(b.id));
}

const rank = (id: string) => {
  const i = TTS_ORDER.indexOf(id);
  return i < 0 ? TTS_ORDER.length : i;
};

/**
 * The speech model to suggest: the best one that fits beside the chat model (`chatVramMb`) into
 * the graphics memory, else the smallest one (it then takes turns with the chat model).
 */
export function recommendTts(models: TtsModelInfo[], language: string, vramMb: number, chatVramMb: number): TtsModelInfo | null {
  const candidates = ttsCandidates(models, language);
  const budget = vramMb - DESKTOP_RESERVE_MB - chatVramMb;
  return candidates.find((m) => m.vram_mb <= budget) ?? [...candidates].sort((a, b) => a.vram_mb - b.vram_mb)[0] ?? null;
}

/** A built-in voice of `model` for `language` (the first one when none matches). */
export function voiceFor(model: TtsModelInfo, language: string): string | null {
  const voices = model.voices.filter((v) => !v.cloned);
  return (voices.find((v) => v.language === language) ?? voices[0])?.voice_id ?? null;
}

/** Whether a licence forbids commercial use (such models are marked, not hidden). */
export const isNoncommercial = (license: string) => /non-?commercial|-nc\b/i.test(license);

/**
 * The image model to suggest: the largest freely usable one that fits the GPU (for a first setup
 * no licence with conditions), else the catalog's own recommendation.
 */
export function recommendImage(models: ImageModelInfo[]): ImageModelInfo | null {
  const free = models.filter((m) => m.fits_gpu && !isNoncommercial(m.license)).sort((a, b) => b.vram_mb - a.vram_mb);
  return free[0] ?? models.find((m) => m.recommended) ?? null;
}

/** The chat model to suggest: the catalog's own recommendation for this GPU. */
export function recommendChat(starters: StarterModel[]): StarterModel | null {
  return starters.find((s) => s.recommended) ?? null;
}

/** What one part of the bundle would still download, in bytes. */
export interface BundlePart {
  /** Bytes still missing (0 when installed). */
  missingBytes: number;
  /** Lands in the models folder (chat) or the data folder (image, speech). */
  where: 'models' | 'data';
}

/** Missing bytes per folder; both folders may lie on the same disk. */
export function bundleBytes(parts: BundlePart[]): { models: number; data: number; total: number } {
  const models = parts.filter((p) => p.where === 'models').reduce((sum, p) => sum + p.missingBytes, 0);
  const data = parts.filter((p) => p.where === 'data').reduce((sum, p) => sum + p.missingBytes, 0);
  return { models, data, total: models + data };
}

/** Whether the free space (MB, `null` = unknown) holds the download with 1 GB to spare. */
export function spaceSuffices(neededBytes: number, freeMb: number | null | undefined): boolean {
  if (freeMb == null) return true;
  return neededBytes / (1024 * 1024) + 1024 <= freeMb;
}

/** Bytes as "1.2 GB" or "350 MB". */
export function formatBytes(bytes: number, locale?: string): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString(locale, { maximumFractionDigits: 1 })} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2)).toLocaleString(locale)} MB`;
}
