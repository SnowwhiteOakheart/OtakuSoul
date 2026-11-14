import type { SongRequest } from '../../types';

export type LyricsMode = 'own' | 'auto' | 'instrumental';

export interface SongDraft {
  title: string;
  caption: string;
  lyrics: string;
  lyricsMode: LyricsMode;
  vocalLanguage: string;
  duration: number;
  bpm: number | null;
  keyscale: string;
  timesignature: string;
  seed: string;
  steps: number | null;
  temperature: number | null;
  versions: number;
}

const DRAFT_KEY = 'otakusoul.songStudio.draft';
export const INSTRUMENTAL = '[Instrumental]';
export const DEFAULT_DRAFT: SongDraft = {
  title: '',
  caption: '',
  lyrics: '',
  lyricsMode: 'auto',
  vocalLanguage: '',
  duration: 120,
  bpm: null,
  keyscale: '',
  timesignature: '',
  seed: '',
  steps: null,
  temperature: null,
  versions: 1,
};

export const loadDraft = (): SongDraft => {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    return stored ? { ...DEFAULT_DRAFT, ...(JSON.parse(stored) as Partial<SongDraft>) } : DEFAULT_DRAFT;
  } catch {
    return DEFAULT_DRAFT;
  }
};
export const saveDraft = (draft: SongDraft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Only a convenience: the form starts empty next time.
  }
};

/** The form as a backend request. */
export const toRequest = (draft: SongDraft, modelId: string): SongRequest => {
  const seed = Number.parseInt(draft.seed, 10);
  return {
    title: draft.title.trim(),
    caption: draft.caption.trim(),
    lyrics: draft.lyricsMode === 'instrumental' ? INSTRUMENTAL : draft.lyricsMode === 'auto' ? '' : draft.lyrics,
    vocal_language: draft.lyricsMode === 'instrumental' ? '' : draft.vocalLanguage,
    duration: draft.duration,
    bpm: draft.bpm,
    keyscale: draft.keyscale,
    timesignature: draft.timesignature,
    seed: Number.isFinite(seed) && seed >= 0 ? seed : null,
    steps: draft.steps,
    lm_temperature: draft.temperature,
    versions: draft.versions,
    model_id: modelId,
  };
};

/** A saved request back into the form (from the song list). */
export const fromRequest = (request: SongRequest, seed: number | null): SongDraft => {
  const lyrics = request.lyrics.trim();
  const lyricsMode: LyricsMode = !lyrics ? 'auto' : lyrics.toLowerCase() === INSTRUMENTAL.toLowerCase() ? 'instrumental' : 'own';
  return {
    title: request.title,
    caption: request.caption,
    lyrics: lyricsMode === 'own' ? request.lyrics : '',
    lyricsMode,
    vocalLanguage: request.vocal_language,
    duration: request.duration || DEFAULT_DRAFT.duration,
    bpm: request.bpm,
    keyscale: request.keyscale,
    timesignature: request.timesignature,
    seed: seed === null ? '' : String(seed),
    steps: request.steps,
    temperature: request.lm_temperature,
    versions: 1,
  };
};

