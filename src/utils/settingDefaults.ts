import type { ChatStyle, LlamaServerConfig, ModelDefaults, SamplingParams } from '../types';

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

/**
 * The model catalog's values for the family of `modelPath` (e.g. Ternary Bonsai: q4 KV cache,
 * thinking on, its own sampler), matched by a text in the file name.
 */
export function modelDefaultsFor(modelPath: string, rules: ModelDefaults[] = []): ModelDefaults | undefined {
  const name = (modelPath.split(/[\\/]/).pop() ?? modelPath).toLowerCase();
  return rules.find((rule) => rule.match.some((text) => name.includes(text.toLowerCase())));
}

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

/** Reply style defaults (as `SamplingParams::default` in `inference.rs` gives new profiles); on the
 * local server with the catalog's values for the model's family. */
export function samplingDefaults(modelPath: string, local: boolean, rules: ModelDefaults[] = []): Partial<SamplingParams> {
  const base: Partial<SamplingParams> = { temperature: 0.7, top_p: 0.9, min_p: 0.05, top_k: 40, repeat_penalty: 1.05, max_tokens: 2048 };
  return local ? { ...base, ...modelDefaultsFor(modelPath, rules)?.sampling } : base;
}

/** KV cache a server config starts with (`LlamaServerConfig::default`): about half of f16, hardly any loss. */
export const DEFAULT_KV_CACHE = 'q8_0';

/** K and V cache types as llama-server runs them: without flash attention a quantized V cache
 * stays f16 (`llama_manager::supported_cache`). For VRAM estimates. */
export function kvCacheTypes(config: Pick<LlamaServerConfig, 'cache_type_k' | 'cache_type_v' | 'flash_attn'>): [string, string] {
  const k = config.cache_type_k || DEFAULT_KV_CACHE;
  const v = config.cache_type_v || DEFAULT_KV_CACHE;
  return [k, config.flash_attn || /^b?f/.test(v) ? v : 'f16'];
}

/** The context a server config starts with before it is fitted to a model (`LlamaServerConfig::default`). */
export const DEFAULT_CONTEXT_SIZE = 4096;

/** Server tuning defaults with the catalog's values for the model's family (model, port and vision
 * projector are not tuning and stay). */
export function serverTuningDefaults(modelPath: string, rules: ModelDefaults[] = []): Partial<LlamaServerConfig> {
  return {
    flash_attn: true,
    reasoning_mode: false,
    thinking_budget: 0,
    batch_size: 2048,
    ubatch_size: 512,
    cache_type_k: DEFAULT_KV_CACHE,
    cache_type_v: DEFAULT_KV_CACHE,
    mlock: false,
    no_mmap: false,
    cpu_moe: false,
    threads: undefined,
    ...modelDefaultsFor(modelPath, rules)?.server,
  };
}

const pick = <T extends object>(from: Partial<T>, keys: string[]): Partial<T> =>
  Object.fromEntries(keys.filter((key) => key in from).map((key) => [key, from[key as keyof T]])) as Partial<T>;

/**
 * Settings for a model chosen for the first time (no saved profile): the user's settings stay,
 * only the values the catalog set for the previous model's family go back to the defaults and
 * those for the new model's family are applied.
 */
export function settingsForNewModel(
  previousPath: string,
  modelPath: string,
  server: LlamaServerConfig,
  sampling: SamplingParams,
  rules: ModelDefaults[],
): { server: LlamaServerConfig; sampling: SamplingParams } {
  const previous = modelDefaultsFor(previousPath, rules);
  const next = modelDefaultsFor(modelPath, rules);
  return {
    server: {
      ...server,
      ...pick(serverTuningDefaults(''), Object.keys(previous?.server ?? {})),
      ...next?.server,
    },
    sampling: {
      ...sampling,
      ...pick(samplingDefaults('', false), Object.keys(previous?.sampling ?? {})),
      ...next?.sampling,
    },
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
