import type { ImageStudioModel, ImageStudioRequest } from '../../types';

export interface ImageDraft {
  title: string;
  prompt: string;
  /** `null` = the negative prompt of the image settings. */
  negative: string | null;
  /** `''` = the model's own size. */
  aspect: string;
  steps: number | null;
  cfgScale: number | null;
  seed: string;
  count: number;
}

const DRAFT_KEY = 'otakusoul.imageStudio.draft';
const MODEL_KEY = 'otakusoul.imageStudio.model';
export const ASPECTS = ['', '1:1', '2:3', '3:2', '9:16', '16:9'] as const;
export const MAX_COUNT = 8;

export const DEFAULT_IMAGE_DRAFT: ImageDraft = {
  title: '',
  prompt: '',
  negative: null,
  aspect: '',
  steps: null,
  cfgScale: null,
  seed: '',
  count: 1,
};

export const loadImageDraft = (): ImageDraft => {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    return stored ? { ...DEFAULT_IMAGE_DRAFT, ...(JSON.parse(stored) as Partial<ImageDraft>) } : DEFAULT_IMAGE_DRAFT;
  } catch {
    return DEFAULT_IMAGE_DRAFT;
  }
};
export const saveImageDraft = (draft: ImageDraft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Only a convenience: the form starts empty next time.
  }
};
export const loadImageModelChoice = () => {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
};
export const saveImageModelChoice = (id: string) => {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // Only a convenience.
  }
};

/**
 * The model the studio uses: the studio's own last pick, else the one of the image settings,
 * else the first installed (the studio's pick never changes the model of chat images).
 */
export const pickImageModel = (models: ImageStudioModel[], studioChoice: string | null, settingsModel: string | null | undefined) =>
  models.find((m) => m.id === studioChoice) ?? models.find((m) => m.id === settingsModel) ?? models[0] ?? null;

/** Same formula as `image_studio::size_for_aspect`: the model's pixel count, steps of 64. */
export const sizeForAspect = (native: [number, number], aspect: string): [number, number] => {
  const [a, b] = aspect.split(':').map(Number);
  if (!a || !b || a / b > 4 || b / a > 4) return native;
  const pixels = native[0] * native[1];
  const width = Math.sqrt((pixels * a) / b);
  const height = pixels / width;
  const snap = (v: number) => Math.max(256, Math.round(v / 64) * 64);
  return [snap(width), snap(height)];
};

export const toImageRequest = (draft: ImageDraft, modelId: string): ImageStudioRequest => {
  const seed = Number.parseInt(draft.seed, 10);
  return {
    title: draft.title.trim(),
    prompt: draft.prompt.trim(),
    negative: draft.negative?.trim() ?? '',
    model_id: modelId,
    aspect: draft.aspect,
    steps: draft.steps,
    cfg_scale: draft.cfgScale,
    seed: Number.isFinite(seed) && seed >= 0 ? seed : null,
    count: Math.min(MAX_COUNT, Math.max(1, draft.count)),
  };
};

/** A saved request back into the form, with the seed the image was made with. */
export const fromImageRequest = (request: ImageStudioRequest, seed: number | null): ImageDraft => ({
  title: request.title,
  prompt: request.prompt,
  negative: request.negative || null,
  aspect: request.aspect,
  steps: request.steps,
  cfgScale: request.cfg_scale,
  seed: seed === null ? '' : String(seed),
  count: 1,
});
