import type { ChatStyle, LlamaServerConfig, SamplingParams } from '../types';

/** Look of a chat without own choices (sliders start here; empty texts = app defaults). */
export const DEFAULT_CHAT_STYLE: ChatStyle = {
  background: null,
  background_dim: 40,
  text_size: '',
  bubbles: '',
  ambient: null,
  ambient_volume: 35,
  reply_length: '',
};

/** Ternary Bonsai runs with a q4 KV cache, thinking on and its own sampler (PrismML's advice). */
export const isBonsaiModel = (modelPath: string) => modelPath.toLowerCase().includes('bonsai');

/**
 * "Write with more variety": DRY (penalizes repeating word sequences) and XTC (sometimes skips the
 * most obvious word) on the local server, presence/frequency penalties for cloud models. Values as
 * recommended by the llama.cpp/SillyTavern community for roleplay.
 */
export const VARIETY_SAMPLING: Partial<SamplingParams> = {
  dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: -1,
  xtc_threshold: 0.1, xtc_probability: 0.5, presence_penalty: 0.3, frequency_penalty: 0.2,
};

/** Variety is on while DRY is active (also when set by hand in expert mode). */
export const varietyOn = (sampling: Partial<SamplingParams>) => (sampling.dry_multiplier ?? 0) > 0;

/** Turning variety off clears exactly what turning it on set. */
export const VARIETY_OFF: Partial<SamplingParams> = Object.fromEntries(
  Object.keys(VARIETY_SAMPLING).map((key) => [key, undefined]),
);

/** Reply style defaults (as `SamplingParams::default` in `inference.rs` gives new profiles); Bonsai on
 * the local server has its own. */
export function samplingDefaults(modelPath: string, local: boolean): Partial<SamplingParams> {
  const base: Partial<SamplingParams> = { temperature: 0.7, top_p: 0.9, min_p: 0.05, top_k: 40, repeat_penalty: 1.05, max_tokens: 2048 };
  return local && isBonsaiModel(modelPath) ? { ...base, top_p: 0.95, top_k: 20 } : base;
}

/** Server tuning defaults (model, port and vision projector are not tuning and stay). */
export function serverTuningDefaults(modelPath: string): Partial<LlamaServerConfig> {
  const bonsai = isBonsaiModel(modelPath);
  return {
    flash_attn: true,
    reasoning_mode: bonsai,
    thinking_budget: 0,
    batch_size: 2048,
    ubatch_size: 512,
    cache_type_k: bonsai ? 'q4_0' : 'f16',
    cache_type_v: bonsai ? 'q4_0' : 'f16',
    mlock: false,
    no_mmap: false,
    cpu_moe: false,
    threads: undefined,
  };
}

export const APPEARANCE_DEFAULTS = { theme: 'obsidian', colorMode: 'system' } as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields of `current` that differ from `defaults` (only fields the defaults know; an empty list or
 * `null` counts as unset). */
export function changedFields<T extends object>(current: T, defaults: Partial<T>, extra: (keyof T)[] = []): (keyof T)[] {
  const keys = new Set<keyof T>([...(Object.keys(defaults) as (keyof T)[]), ...extra]);
  return [...keys].filter((key) => {
    const value = current[key];
    const unset = value === undefined || value === null || (Array.isArray(value) && value.length === 0);
    const fallback = defaults[key];
    if (fallback === undefined) return !unset;
    return !same(value, fallback);
  });
}

/** Sampler fields beyond the defaults (top_k, penalties, DRY, XTC …): set means changed. */
export const EXTRA_SAMPLING_FIELDS: (keyof SamplingParams)[] = [
  'top_k', 'frequency_penalty', 'presence_penalty', 'repeat_penalty', 'dynatemp_range', 'dynatemp_exponent',
  'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n', 'xtc_threshold', 'xtc_probability',
  'stop_strings',
];
