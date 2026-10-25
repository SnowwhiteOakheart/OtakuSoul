import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { CLOUD_PROVIDER_DEFAULTS, normalizeReplyLanguage, useAppStore } from '../store/useAppStore';
import { resetApiMocks } from './mockApi';
import type { AppSettings } from '../types';
import { LOCALES, t } from '../i18n';
import { en, ru } from './locales';

const initialState = useAppStore.getState();

beforeEach(() => {
  resetApiMocks();
  // As after `initApp`: settings are known, so changes are saved.
  useAppStore.setState({ ...initialState, settingsLoaded: true }, true);
});

const lastSavedSettings = (): AppSettings => {
  const calls = vi.mocked(api.saveSettings).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0];
};

describe('store composition', () => {
  it('exposes every slice through one store', () => {
    const state = useAppStore.getState();
    // One representative member per slice.
    for (const key of [
      'setActiveTab',
      'setAvatarMode',
      'startServer',
      'selectCharacter',
      'refreshLorebooks',
      'fetchCognitiveOverview',
      'runStageTurn',
      'fetchCompanionState',
      'sendMessage',
      'fetchBackups',
    ] as const) {
      expect(typeof state[key]).toBe('function');
    }
  });
});

describe('cloud providers', () => {
  it.each(Object.entries(CLOUD_PROVIDER_DEFAULTS))('switching to %s sets its endpoint and model', (provider, defaults) => {
    useAppStore.getState().setCloudProvider(provider as keyof typeof CLOUD_PROVIDER_DEFAULTS);
    const { cloudEndpoint, cloudModel } = useAppStore.getState();
    expect(cloudEndpoint).toBe(defaults!.endpoint);
    expect(cloudModel).toBe(defaults!.model);
  });

  it('points the local provider at the configured llama-server port', () => {
    useAppStore.getState().setServerConfig({ port: 9123 });
    useAppStore.getState().setCloudProvider('local_llama');
    expect(useAppStore.getState().cloudEndpoint).toBe('http://127.0.0.1:9123/v1/chat/completions');
  });

  it('keeps the endpoint for a custom provider', () => {
    useAppStore.getState().setCloudEndpoint('https://example.invalid/v1');
    useAppStore.getState().setCloudProvider('custom');
    expect(useAppStore.getState().cloudEndpoint).toBe('https://example.invalid/v1');
  });
});

describe('settings persistence', () => {
  it('saves the current choices including the onboarding flag', async () => {
    const store = useAppStore.getState();
    store.setTheme('sakura');
    store.setColorMode('light');
    store.setReplyLanguage('English');
    store.completeOnboarding();
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalled());

    const saved = lastSavedSettings();
    expect(saved.theme).toBe('sakura');
    expect(saved.color_mode).toBe('light');
    expect(saved.reply_language).toBe('English');
    expect(saved.onboarding_completed).toBe(true);
  });

  it('shows the wizard only when the loaded settings say so', async () => {
    vi.mocked(api.getAppPaths).mockResolvedValue({} as never);
    vi.mocked(api.scanModels).mockResolvedValue([]);
    vi.mocked(api.scanVrmModels).mockResolvedValue([]);
    vi.mocked(api.loadSettings).mockResolvedValue({
      server_config: { model_path: '' },
      onboarding_completed: false,
    } as unknown as AppSettings);

    await useAppStore.getState().initApp();
    expect(useAppStore.getState().onboardingCompleted).toBe(false);
  });
});

describe('local model selection', () => {
  it('stops the previous server before selecting a different model', async () => {
    let finishStop!: () => void;
    vi.mocked(api.stopLlamaServer).mockImplementation(() => new Promise<void>((resolve) => {
      finishStop = resolve;
    }));
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/old.gguf' } });

    const selecting = useAppStore.getState().selectLocalModel('/new.gguf');
    expect(api.stopLlamaServer).toHaveBeenCalledOnce();
    expect(useAppStore.getState().serverConfig.model_path).toBe('/old.gguf');

    finishStop();
    await selecting;
    expect(useAppStore.getState().serverConfig.model_path).toBe('/new.gguf');
    expect(lastSavedSettings().server_config.model_path).toBe('/new.gguf');
  });

  it('sizes context and GPU layers for the new model', async () => {
    vi.mocked(api.getLayerRecommendation).mockResolvedValue({
      recommended_layers: 99,
      recommended_context_size: 32_768,
      trained_context_size: 131_072,
      available_vram_mb: 14_840,
    } as Awaited<ReturnType<typeof api.getLayerRecommendation>>);
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/old.gguf', context_size: 4096, gpu_layers: 20 } });

    await useAppStore.getState().selectLocalModel('/nemo.gguf');
    expect(api.getLayerRecommendation).toHaveBeenCalledWith(0, 0, 4096, '/nemo.gguf', 'q8_0', 'q8_0');
    expect(useAppStore.getState().serverConfig).toMatchObject({ context_size: 32_768, gpu_layers: 99 });
    expect(lastSavedSettings().server_config.context_size).toBe(32_768);
  });
});

describe('writing on their own in a chat that is not open', () => {
  const lirwen = { id: 'lirwen', card: { data: { name: 'Lirwen', extensions: {} } } };
  const session = { id: 'c-lirwen', character_id: 'lirwen', title: '', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0,
    message_count: 2, summary: '', summary_until: -1, members: [] };
  const history = [
    { id: 'm1', chat_id: 'c-lirwen', role: 'user', content: 'Bis morgen!', created_at: 1, order_index: 0, attachments: [], swipe_index: 0, swipes: [] },
  ];
  const setup = () => {
    useAppStore.setState({ availableCharacters: [lirwen] as never, activeChatId: 'c-open', storedMessages: [] });
    vi.mocked(api.getChatSession).mockResolvedValue(session as never);
    vi.mocked(api.getChatMessages).mockResolvedValue(history as never);
    vi.mocked(api.assemblePrompt).mockResolvedValue({ system: 'Du bist Lirwen.', post_history: null } as never);
    vi.mocked(api.addChatMessage).mockImplementation(async (chatId, role, content) => ({ id: 'new', chat_id: chatId, role, content } as never));
  };

  it("writes with the other character's card and history into their chat", async () => {
    setup();
    vi.mocked(api.sendChatMessage).mockResolvedValue({ generation_id: 'g', full_text: 'Na, wie war dein Tag?', full_thought: '', aborted: false } as never);
    const stored = await useAppStore.getState().writeOnOwnIn('lirwen', 'c-lirwen', (name) => `[${name} schreibt]`);
    expect(stored).toMatchObject({ chat_id: 'c-lirwen', content: 'Na, wie war dein Tag?' });
    const request = vi.mocked(api.sendChatMessage).mock.calls[0]![0];
    expect(request.messages.map((m) => m.content)).toEqual(['Du bist Lirwen.', 'Bis morgen!', '[Lirwen schreibt]']);
    expect(vi.mocked(api.assemblePrompt).mock.calls[0]![0]).toMatchObject({ char_name: 'Lirwen' });
    // The open chat is not touched.
    expect(useAppStore.getState().storedMessages).toEqual([]);
  });

  it('gives way to a reply in the open chat', async () => {
    setup();
    let finish: (value: unknown) => void = () => {};
    vi.mocked(api.sendChatMessage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
    vi.mocked(api.abortChatGeneration).mockImplementation(async () => finish({ generation_id: 'g', full_text: 'Na', full_thought: '', aborted: true }));
    const writing = useAppStore.getState().writeOnOwnIn('lirwen', 'c-lirwen', () => '[x]');
    await vi.waitFor(() => expect(api.sendChatMessage).toHaveBeenCalledTimes(1));
    expect(await useAppStore.getState().writeOnOwnIn('lirwen', 'c-lirwen', () => '[x]')).toBeNull(); // one at a time
    // What the open chat's reply does before sending.
    vi.mocked(api.sendChatMessage).mockResolvedValue({ generation_id: 'h', full_text: 'Hallo', full_thought: '', aborted: false } as never);
    useAppStore.setState({ activeCharacter: lirwen as never, activeChatId: 'c-open', chatSessions: [] });
    await useAppStore.getState().writeOnOwn(() => '[y]');
    expect(api.abortChatGeneration).toHaveBeenCalled();
    expect(await writing).toBeNull();
    expect(api.addChatMessage).not.toHaveBeenCalledWith('c-lirwen', 'assistant', expect.anything(), expect.anything());
  });
});

describe('settings per local model', () => {
  const bonsai = { match: ['bonsai'], server: { cache_type_k: 'q4_0', reasoning_mode: true }, sampling: { top_k: 20 } };

  it('remembers the settings of each model and restores them when it is chosen again', async () => {
    useAppStore.setState({
      modelDefaults: [bonsai],
      serverConfig: { ...initialState.serverConfig, model_path: '/m/nemo.gguf', context_size: 12_288, cache_type_k: 'f16' },
      sampling: { ...initialState.sampling, temperature: 1.2, top_k: 40 },
    });
    await useAppStore.getState().selectLocalModel('/m/Ternary-Bonsai-2-27B.gguf');
    // New model without a profile: the family values apply, the user's temperature stays.
    expect(useAppStore.getState().serverConfig).toMatchObject({ cache_type_k: 'q4_0', reasoning_mode: true });
    expect(useAppStore.getState().sampling).toMatchObject({ temperature: 1.2, top_k: 20 });
    useAppStore.getState().setSampling({ temperature: 0.5 });

    vi.mocked(api.getLayerRecommendation).mockClear();
    await useAppStore.getState().selectLocalModel('/other/nemo.gguf');
    // Known by its file name: back to its own context and sampler, without refitting.
    expect(useAppStore.getState().serverConfig).toMatchObject({ model_path: '/other/nemo.gguf', context_size: 12_288, cache_type_k: 'f16' });
    expect(useAppStore.getState().sampling).toMatchObject({ temperature: 1.2, top_k: 40 });
    expect(lastSavedSettings().model_profiles?.['Ternary-Bonsai-2-27B.gguf']?.sampling.temperature).toBe(0.5);

    await useAppStore.getState().selectLocalModel('/m/Ternary-Bonsai-2-27B.gguf');
    expect(useAppStore.getState().sampling).toMatchObject({ temperature: 0.5, top_k: 20 });
  });

  it('does not take settings made for a cloud model into the local profile', async () => {
    useAppStore.setState({
      selectedBackend: 'cloud',
      serverConfig: { ...initialState.serverConfig, model_path: '/m/nemo.gguf' },
    });
    useAppStore.getState().setSampling({ temperature: 1.4 });
    expect(lastSavedSettings().model_profiles?.['nemo.gguf']).toBeUndefined();
  });
});

describe('vision projector of the local model', () => {
  const projector = (path: string) => ({ name: path, path, size_mb: 170, runtime: 'standard', recommended_context: 0, compatibility_note: '' });

  it('switches to the projector of the newly selected model', async () => {
    vi.mocked(api.scanVisionProjectors).mockResolvedValue([projector('/m/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf'), projector('/m/e4b-mmproj-F16.gguf')]);
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/m/e4b.gguf', mmproj_path: '/m/e4b-mmproj-F16.gguf' } });
    await useAppStore.getState().selectLocalModel('/m/gemma-4-12b-it-Q4_K_M.gguf');
    expect(useAppStore.getState().serverConfig.mmproj_path).toBe('/m/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf');
    // A model without its own projector drops the other model's one.
    await useAppStore.getState().selectLocalModel('/m/nemo.gguf');
    expect(useAppStore.getState().serverConfig.mmproj_path).toBeNull();
    expect(lastSavedSettings().server_config.mmproj_path).toBeNull();
  });

  it('downloads a starter projector and uses it for its model', async () => {
    vi.mocked(api.downloadGgufModel).mockResolvedValue('/m/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf');
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/m/gemma-4-12b-it-Q4_K_M.gguf', mmproj_path: null } });
    const file = { filename: 'gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf', size_bytes: 175_115_840, sha256: 'x', size_formatted: '0.16 GB',
      download_url: 'https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/main/mmproj-F16.gguf', quantization: 'F16',
      runtime: 'standard' as const, recommended: false, compatibility_note: '' };
    await useAppStore.getState().downloadVisionProjector(file, '/m/gemma-4-12b-it-Q4_K_M.gguf');
    expect(api.downloadGgufModel).toHaveBeenCalledWith(file);
    expect(api.stopLlamaServer).toHaveBeenCalled();
    expect(useAppStore.getState().serverConfig.mmproj_path).toBe('/m/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf');
  });
});

describe('LoRA adapter of the local model', () => {
  const lora = {
    id: 'gemma-4-e4b-heretic', name: 'Heretic', base_files: ['gemma-4-E4B-it-Q4_K_M.gguf'], kind: 'uncensor', nsfw: true,
    scale: 1, description: {}, license: 'unspecified', license_kind: 'restricted', license_note: {}, license_url: 'https://huggingface.co/x',
    size_bytes: 213_248, size_formatted: '209 KB', path: '/m/chat-loras/gemma-4-e4b-heretic.gguf', installed: false,
  };

  it('downloads a catalog adapter and uses it for its model', async () => {
    vi.mocked(api.downloadChatLora).mockResolvedValue(lora.path);
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/m/gemma-4-E4B-it-Q4_K_M.gguf', lora_path: null } });
    await useAppStore.getState().downloadChatLora(lora, '/m/gemma-4-E4B-it-Q4_K_M.gguf');
    expect(api.downloadChatLora).toHaveBeenCalledWith('gemma-4-e4b-heretic');
    expect(api.stopLlamaServer).toHaveBeenCalled();
    expect(useAppStore.getState().serverConfig).toMatchObject({ lora_path: lora.path, lora_scale: 1 });
    expect(lastSavedSettings().server_config.lora_path).toBe(lora.path);
  });

  it('keeps no adapter when the model changed during the download', async () => {
    vi.mocked(api.downloadChatLora).mockImplementation(async () => {
      useAppStore.setState((s) => ({ serverConfig: { ...s.serverConfig, model_path: '/m/other.gguf' } }));
      return lora.path;
    });
    useAppStore.setState({ serverConfig: { ...initialState.serverConfig, model_path: '/m/gemma-4-E4B-it-Q4_K_M.gguf', lora_path: null } });
    await useAppStore.getState().downloadChatLora(lora, '/m/gemma-4-E4B-it-Q4_K_M.gguf');
    expect(useAppStore.getState().serverConfig.lora_path).toBeNull();
  });

  it('drops the adapter when another model is chosen for the first time', async () => {
    vi.mocked(api.scanVisionProjectors).mockResolvedValue([]);
    useAppStore.setState({
      modelProfiles: {},
      serverConfig: { ...initialState.serverConfig, model_path: '/m/gemma-4-E4B-it-Q4_K_M.gguf', lora_path: lora.path, lora_scale: 0.6 },
    });
    await useAppStore.getState().selectLocalModel('/m/nemo.gguf');
    expect(useAppStore.getState().serverConfig).toMatchObject({ lora_path: null, lora_scale: 1 });
  });
});

describe('context of the local model at start', () => {
  const recommendation = {
    recommended_layers: 99,
    recommended_context_size: 65_536,
    trained_context_size: 262_144,
    available_vram_mb: 14_840,
  } as Awaited<ReturnType<typeof api.getLayerRecommendation>>;
  const start = async (serverConfig: Record<string, unknown>, extra: Partial<AppSettings> = {}) => {
    useAppStore.setState({ settingsLoaded: false });
    vi.mocked(api.getAppPaths).mockResolvedValue({} as never);
    vi.mocked(api.scanModels).mockResolvedValue([{ name: 'Ternary-Bonsai-2-27B', path: '/m/bonsai.gguf', size_mb: 6900 }] as never);
    vi.mocked(api.scanVrmModels).mockResolvedValue([]);
    vi.mocked(api.loadPersonas).mockResolvedValue([]);
    vi.mocked(api.getLayerRecommendation).mockResolvedValue(recommendation);
    vi.mocked(api.loadSettings).mockResolvedValue({ server_config: serverConfig, ...extra } as unknown as AppSettings);
    vi.mocked(api.getModelDefaults).mockResolvedValue([{ match: ['bonsai'], server: { cache_type_k: 'q4_0', cache_type_v: 'q4_0' }, sampling: {} }]);
    await useAppStore.getState().initApp();
  };

  it('fits a model the app chose itself (none saved yet)', async () => {
    await start({ model_path: '', context_size: 4096, gpu_layers: 99 });
    expect(useAppStore.getState().serverConfig).toMatchObject({ model_path: '/m/bonsai.gguf', context_size: 65_536, cache_type_k: 'q4_0' });
    expect(lastSavedSettings().server_config.context_size).toBe(65_536);
  });

  it('fits a saved model once that is still on the bare default context', async () => {
    await start({ model_path: '/m/bonsai.gguf', context_size: 4096, gpu_layers: 99, cache_type_k: 'f16', cache_type_v: 'f16' });
    expect(api.getLayerRecommendation).toHaveBeenCalledWith(6900, 0, 4096, '/m/bonsai.gguf', 'f16', 'f16');
    expect(useAppStore.getState().serverConfig).toMatchObject({ context_size: 65_536, cache_type_k: 'f16' });
  });

  it('keeps a context that was fitted or set by hand', async () => {
    await start({ model_path: '/m/bonsai.gguf', context_size: 16_384, gpu_layers: 99 });
    await start({ model_path: '/m/bonsai.gguf', context_size: 4096, gpu_layers: 99 }, { expert_mode: true });
    expect(api.getLayerRecommendation).not.toHaveBeenCalled();
    expect(useAppStore.getState().serverConfig.context_size).toBe(4096);
  });
});

describe('local AI on demand', () => {
  const status = (state: string) => ({ state, port: 48596, pid: null, model_name: null, error_message: null, notice: null, recent_logs: [] });

  it('starts a stopped local model before a request and waits for it', async () => {
    vi.mocked(api.getLlamaServerStatus).mockResolvedValueOnce(status('stopped') as never).mockResolvedValue(status('running') as never);
    useAppStore.setState({ selectedBackend: 'local', serverConfig: { ...initialState.serverConfig, model_path: '/m.gguf' } });
    await useAppStore.getState().ensureLocalAi();
    expect(api.startLlamaServer).toHaveBeenCalledOnce();
  });

  it('leaves a running model and the cloud alone', async () => {
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue(status('running') as never);
    useAppStore.setState({ selectedBackend: 'local', serverConfig: { ...initialState.serverConfig, model_path: '/m.gguf' } });
    await useAppStore.getState().ensureLocalAi();
    useAppStore.setState({ selectedBackend: 'cloud' });
    await useAppStore.getState().ensureLocalAi();
    expect(api.startLlamaServer).not.toHaveBeenCalled();
  });

  it('passes a failed start on to the request without a toast', async () => {
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue(status('stopped') as never);
    vi.mocked(api.startLlamaServer).mockRejectedValue(new Error('kein VRAM'));
    useAppStore.setState({ selectedBackend: 'local', serverConfig: { ...initialState.serverConfig, model_path: '/m.gguf' } });
    await expect(useAppStore.getState().ensureLocalAi()).rejects.toThrow('kein VRAM');
  });
});

describe('settings sections', () => {
  it('opens a requested section once', () => {
    const store = useAppStore.getState();
    store.openSettingsSection('hub');
    expect(useAppStore.getState().activeTab).toBe('settings');
    expect(store.consumePendingSettingsSection()).toBe('hub');
    expect(store.consumePendingSettingsSection()).toBeNull();
  });
});

describe('normalizeReplyLanguage', () => {
  it.each([
    ['en', 'English'],
    ['ru', 'Русский'],
    ['Deutsch', 'Deutsch'],
    ['Klingonisch', 'Klingonisch'],
    [null, 'Deutsch'],
    ['', 'Deutsch'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeReplyLanguage(input)).toBe(expected);
  });
});

describe('startup', () => {
  const ayu = { id: 'ayu', card: { data: { name: 'Ayu' } } };
  const rin = { id: 'rin', card: { data: { name: 'Rin' } } };

  it('neither picks a character nor saves before the settings are loaded', async () => {
    useAppStore.setState({ settingsLoaded: false });
    vi.mocked(api.scanCharacters).mockResolvedValue([ayu, rin] as never);
    await useAppStore.getState().refreshCharacters();
    await useAppStore.getState().saveCurrentSettings();
    expect(useAppStore.getState().activeCharacter).toBeNull();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('lists the language files and loads the saved language with its fallback', async () => {
    // The i18n registry was loaded by the test setup with the real api object.
    const real = await vi.importActual<typeof import('../services/api')>('../services/api');
    const load = vi.spyOn(real.api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Czat' });
    vi.mocked(api.getAppPaths).mockResolvedValue({} as never);
    vi.mocked(api.scanModels).mockResolvedValue([]);
    vi.mocked(api.scanVrmModels).mockResolvedValue([]);
    vi.mocked(api.loadSettings).mockResolvedValue({ server_config: { model_path: '' }, app_language: 'pl' } as unknown as AppSettings);
    const language = { author: '', version: '', translated: 1, total: 3, downloaded: false };
    vi.mocked(api.listUiLanguages).mockResolvedValue([
      { ...language, id: 'de', name: 'Deutsch', english_name: 'German', fallback: null, custom: false },
      { ...language, id: 'pl', name: 'Polski', english_name: 'Polish', fallback: 'en', custom: true },
    ]);
    await useAppStore.getState().initApp();
    expect(useAppStore.getState().availableLanguages.map((l) => l.id)).toEqual(['de', 'pl']);
    expect(useAppStore.getState().appLanguage).toBe('pl');
    expect(load).toHaveBeenCalledWith('pl');
    expect(t('nav.chat', 'pl')).toBe('Czat');
    expect(t('nav.characters', 'pl')).toBe('Characters');
    load.mockRestore();
  });

  it('imports a language file and switches to German when the own language is removed', async () => {
    const real = await vi.importActual<typeof import('../services/api')>('../services/api');
    const load = vi.spyOn(real.api, 'loadUiLanguage').mockResolvedValue({ 'nav.chat': 'Czat' });
    const language = { author: '', version: '', translated: 1, total: 3, fallback: null, downloaded: false };
    const de = { ...language, id: 'de', name: 'Deutsch', english_name: 'German', custom: false };
    const pl = { ...language, id: 'pl', name: 'Polski', english_name: 'Polish', custom: true };
    vi.mocked(api.importUiLanguage).mockResolvedValue('pl');
    vi.mocked(api.listUiLanguages).mockResolvedValue([de, pl]);
    expect(await useAppStore.getState().importUiLanguage('/x/polski.json')).toEqual(pl);
    expect(api.importUiLanguage).toHaveBeenCalledWith('/x/polski.json');
    expect(useAppStore.getState().availableLanguages).toHaveLength(2);

    useAppStore.setState({ appLanguage: 'pl' });
    vi.mocked(api.listUiLanguages).mockResolvedValue([de]);
    await useAppStore.getState().removeUiLanguage('pl');
    expect(api.removeUiLanguage).toHaveBeenCalledWith('pl');
    await vi.waitFor(() => expect(useAppStore.getState().appLanguage).toBe('de'));
    load.mockRestore();
    // `refreshLanguages` drops loaded languages; the other tests expect the setup's.
    Object.assign(LOCALES, { en, ru });
  });

  it('opens the last used character right away, not the first one', async () => {
    useAppStore.setState({ settingsLoaded: false });
    vi.mocked(api.getAppPaths).mockResolvedValue({} as never);
    vi.mocked(api.loadSettings).mockResolvedValue({ server_config: { model_path: '' }, active_character_id: 'rin' } as unknown as AppSettings);
    vi.mocked(api.scanModels).mockResolvedValue([]);
    vi.mocked(api.scanVrmModels).mockResolvedValue([]);
    vi.mocked(api.scanCharacters).mockResolvedValue([ayu, rin] as never);
    vi.mocked(api.listChatSessions).mockResolvedValue([]);
    vi.mocked(api.loadPersonas).mockResolvedValue([]);
    const opened: string[] = [];
    const unsubscribe = useAppStore.subscribe((state, before) => {
      if (state.activeCharacter && state.activeCharacter !== before.activeCharacter) opened.push(state.activeCharacter.id);
    });
    // The chat view asks for the characters while the app is still starting.
    await Promise.all([useAppStore.getState().initApp(), useAppStore.getState().loadPresetCharacters()]);
    unsubscribe();
    expect(opened).toEqual(['rin']);
  });
});
