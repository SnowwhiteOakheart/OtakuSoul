// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import { applyPendingVoice, runBundle, useSetupBundle } from '../components/onboarding/setupBundleStore';
import { DEFAULT_VOICE_DESCRIPTION, bundleBytes, formatBytes, isNoncommercial, recommendImage, recommendTts, spaceSuffices, ttsCandidates, voiceFor } from '../utils/setupBundle';
import type { ImageModelInfo, StarterModel, TtsModelInfo } from '../types';

const tts = (id: string, vram: number, over: Partial<TtsModelInfo> = {}): TtsModelInfo => ({
  id, name: id, license: 'Apache-2.0', noncommercial: false, allowed: true, languages: ['de', 'en'], cloning: false,
  needs_clone: false, clone_experimental: false, voice_design: false, style_control: false, sound_tags: false,
  vram_mb: vram, download_bytes: 1e9, missing_bytes: 1e9, installed: false,
  voices: [{ voice_id: 'preset:ryan', label: 'Ryan', language: 'en', cloned: false }, { voice_id: 'preset:bernd', label: 'Bernd', language: 'de', cloned: false }],
  ...over,
});
const catalog = [
  tts('kokoro-de', 600, { languages: ['de'] }),
  tts('qwen3-tts-customvoice-1.7b', 3600),
  tts('qwen3-tts-1.7b', 3600, { needs_clone: true }),
  tts('qwen3-tts-1.7b-voicedesign', 3600, { voice_design: true }),
  tts('f5-tts-v1', 2000, { allowed: false }),
  tts('chatterbox-turbo', 2000, { languages: ['en'] }),
  tts('qwen3-tts-customvoice-0.6b', 3200),
];

describe('speech model recommendation', () => {
  it('offers VoiceDesign first, then models with built-in voices in the language', () => {
    expect(ttsCandidates(catalog, 'de').map((m) => m.id)).toEqual([
      'qwen3-tts-1.7b-voicedesign', 'qwen3-tts-customvoice-1.7b', 'qwen3-tts-customvoice-0.6b', 'kokoro-de',
    ]);
    expect(ttsCandidates(catalog, 'en').map((m) => m.id)).toContain('chatterbox-turbo');
  });

  it('picks the best model that fits beside the chat model, else the smallest', () => {
    // 16 GB card with a 7 GB chat model: VoiceDesign fits beside it (the cards describe the voices).
    expect(recommendTts(catalog, 'de', 16_384, 7_000)?.id).toBe('qwen3-tts-1.7b-voicedesign');
    // Without VoiceDesign the model with built-in voices and speaking style.
    expect(recommendTts(catalog.filter((m) => !m.voice_design), 'de', 16_384, 7_000)?.id).toBe('qwen3-tts-customvoice-1.7b');
    // 8 GB card with a 5 GB chat model: only Kokoro fits.
    expect(recommendTts(catalog, 'de', 8_192, 5_000)?.id).toBe('kokoro-de');
    // Nothing fits: the smallest one (it takes turns with the chat model).
    expect(recommendTts(catalog, 'de', 4_096, 4_000)?.id).toBe('kokoro-de');
    expect(recommendTts(catalog, 'en', 16_384, 0)?.id).toBe('qwen3-tts-1.7b-voicedesign');
    expect(recommendTts(catalog, 'ja', 16_384, 0)).toBeNull();
    expect(recommendTts([], 'de', 16_384, 0)).toBeNull();
  });

  it('chooses a voice in the language, else the first one', () => {
    expect(voiceFor(catalog[1]!, 'de')).toBe('preset:bernd');
    expect(voiceFor(catalog[1]!, 'ja')).toBe('preset:ryan');
    expect(voiceFor(catalog[3]!, 'de')).toBe('');
  });
});

describe('image model recommendation', () => {
  const image = (id: string, vram: number, license: string, fits = true) => ({ id, vram_mb: vram, license, fits_gpu: fits, recommended: false }) as ImageModelInfo;
  it('prefers the largest freely usable model that fits', () => {
    const models = [image('counterfeit', 2500, 'CreativeML Open RAIL-M'), image('animagine', 7500, 'CreativeML Open RAIL++-M'),
      image('flux-dev', 10000, 'FLUX.1 [dev] Non-Commercial'), image('flux2', 21500, 'FLUX.2 [dev] Non-Commercial', false)];
    expect(recommendImage(models)?.id).toBe('animagine');
    expect(recommendImage([models[2]!, { ...models[3]!, recommended: true }])?.id).toBe('flux2');
    expect(isNoncommercial('CC-BY-NC-4.0')).toBe(true);
    expect(isNoncommercial('Apache-2.0')).toBe(false);
  });
});

describe('download size and disk space', () => {
  it('sums the missing bytes per folder', () => {
    expect(bundleBytes([{ missingBytes: 7e9, where: 'models' }, { missingBytes: 6e9, where: 'data' }, { missingBytes: 1e9, where: 'data' }]))
      .toEqual({ models: 7e9, data: 7e9, total: 14e9 });
  });

  it('wants 1 GB to spare and trusts an unknown disk', () => {
    expect(spaceSuffices(10 * 1024 ** 3, 12 * 1024)).toBe(true);
    expect(spaceSuffices(10 * 1024 ** 3, 10.5 * 1024)).toBe(false);
    expect(spaceSuffices(10 * 1024 ** 3, null)).toBe(true);
  });

  it('formats sizes', () => {
    expect(formatBytes(7.1 * 1024 ** 3, 'en')).toBe('7.1 GB');
    expect(formatBytes(213_248, 'en')).toBe('1 MB');
    expect(formatBytes(350 * 1024 ** 2, 'en')).toBe('350 MB');
  });
});

describe('loading everything', () => {
  const starter = { id: 'gemma-4-12b', name: 'Gemma 4 12B', installed: false, vram_mb: 7000, mmproj: null, mmproj_installed: false,
    file: { filename: 'gemma-4-12b-it-Q4_K_M.gguf', runtime: 'standard', size_bytes: 7e9 } } as unknown as StarterModel;
  const image = { id: 'animagine-xl-4', installed: false } as ImageModelInfo;
  const initial = useAppStore.getState();

  beforeEach(() => {
    resetApiMocks();
    useSetupBundle.getState().reset();
    useAppStore.setState(initial, true);
    vi.mocked(api.getRuntime).mockResolvedValue({ version: 'b1' } as never);
    vi.mocked(api.onImageModelProgress).mockResolvedValue(() => {});
    vi.mocked(api.onTtsModelProgress).mockResolvedValue(() => {});
    vi.mocked(api.saveImageGenConfig).mockResolvedValue();
  });

  it('sets up chat, pictures and voice one after another', async () => {
    vi.mocked(api.downloadGgufModel).mockResolvedValue('/m/gemma-4-12b-it-Q4_K_M.gguf');
    vi.mocked(api.getRuntime).mockImplementation(async (kind) => (kind === 'sd' ? null : ({ version: 'b1' } as never)));
    vi.mocked(api.listRuntimeVariants).mockResolvedValue([{ backend: 'cuda', recommended: true } as never]);
    // The store selects the model after its download.
    const download = vi.spyOn(useAppStore.getState(), 'downloadGgufModel').mockImplementation(async () => {
      useAppStore.setState((s) => ({ serverConfig: { ...s.serverConfig, model_path: '/m/gemma-4-12b-it-Q4_K_M.gguf' } }));
    });
    await runBundle({ chat: starter, image, tts: { model: catalog[1]!, voiceId: 'preset:bernd' } });
    expect(download).toHaveBeenCalled();
    expect(api.installRuntime).toHaveBeenCalledWith('sd', 'cuda');
    expect(api.installRuntime).toHaveBeenCalledTimes(1);
    expect(api.downloadImageModel).toHaveBeenCalledWith('animagine-xl-4', false);
    expect(api.saveImageGenConfig).toHaveBeenCalledWith(expect.objectContaining({ provider: 'local', local_model_id: 'animagine-xl-4' }));
    expect(api.downloadTtsModel).toHaveBeenCalledWith('qwen3-tts-customvoice-1.7b');
    const { status, pendingVoice, running } = useSetupBundle.getState();
    expect(Object.values(status).map((s) => s.phase)).toEqual(['done', 'done', 'done']);
    expect(pendingVoice).toEqual({ modelId: 'qwen3-tts-customvoice-1.7b', voiceId: 'preset:bernd' });
    expect(running).toBe(false);
  });

  it('marks a failed part and still sets up the others', async () => {
    vi.mocked(api.downloadImageModel).mockRejectedValue(new Error('Netz weg'));
    await runBundle({ chat: null, image, tts: { model: catalog[0]!, voiceId: 'preset:bernd' } });
    const { status } = useSetupBundle.getState();
    expect(status.chat.phase).toBe('idle');
    expect(status.image).toEqual({ phase: 'failed', error: 'Netz weg' });
    expect(status.tts.phase).toBe('done');
    expect(api.saveImageGenConfig).not.toHaveBeenCalled();
  });

  it('gives the chosen character the downloaded voice once', async () => {
    useSetupBundle.setState({ pendingVoice: { modelId: 'kokoro-de', voiceId: 'preset:bernd' } });
    useAppStore.setState({ activeCharacter: { id: 'shiori', card: { data: { extensions: {} } } } as never, activeVoiceConfig: { engine: 'edge', voice_id: 'x', rate: '+0%' } as never });
    const save = vi.spyOn(useAppStore.getState(), 'saveVoiceConfigForCharacter').mockResolvedValue();
    await applyPendingVoice();
    expect(save).toHaveBeenCalledWith('shiori', expect.objectContaining({ engine: 'local', local_model_id: 'kokoro-de', voice_id: 'preset:bernd', rate: '+0%' }));
    await applyPendingVoice();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('lets VoiceDesign speak with the voice the card describes, else a neutral one', async () => {
    const save = vi.spyOn(useAppStore.getState(), 'saveVoiceConfigForCharacter').mockResolvedValue();
    const card = (voice?: string) => ({ id: 'c', card: { data: { extensions: voice ? { otakusoul_voice: { description: voice } } : {} } } }) as never;
    useSetupBundle.setState({ pendingVoice: { modelId: 'qwen3-tts-1.7b-voicedesign', voiceId: '' } });
    useAppStore.setState({ activeCharacter: card('A bright, cheerful young woman, quick pace.'), activeVoiceConfig: { engine: 'edge', voice_id: 'x', openai_instructions: '' } as never });
    await applyPendingVoice();
    expect(save).toHaveBeenLastCalledWith('c', expect.objectContaining({
      engine: 'local', local_model_id: 'qwen3-tts-1.7b-voicedesign', voice_id: '', openai_instructions: 'A bright, cheerful young woman, quick pace.',
    }));
    useSetupBundle.setState({ pendingVoice: { modelId: 'qwen3-tts-1.7b-voicedesign', voiceId: '' } });
    useAppStore.setState({ activeCharacter: card(), activeVoiceConfig: { engine: 'edge', voice_id: 'x', openai_instructions: '' } as never });
    await applyPendingVoice();
    expect(save).toHaveBeenLastCalledWith('c', expect.objectContaining({ openai_instructions: DEFAULT_VOICE_DESCRIPTION }));
  });
});
