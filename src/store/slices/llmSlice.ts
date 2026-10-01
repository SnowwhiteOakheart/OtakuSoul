import { api } from '../../services/api';
import { CLOUD_PROVIDER_DEFAULTS } from '../helpers';
import type {
  HardwareInfo,
  ServerStatus,
  LlamaServerConfig,
  LayerRecommendation,
  ScannedModel,
  SamplingParams,
  LlmProviderType,
  OpenRouterModelInfo,
  LlmPreset,
  HfModelSummary,
  HfGgufFile,
  DownloadProgressEvent,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { errorMessage } from '../../utils/errors';

/** Local llama-server, hardware, cloud providers, sampler, LLM presets and the GGUF model hub. */
export interface LlmSlice {
  scannedModels: ScannedModel[];
  hardware: HardwareInfo | null;
  layerRecommendation: LayerRecommendation | null;
  fetchHardware: () => Promise<void>;
  fetchLayerRecommendation: (
    modelSizeMb: number,
    totalLayers: number,
    contextSize: number,
    modelPath?: string,
    cacheTypeK?: string,
    cacheTypeV?: string
  ) => Promise<void>;
  serverStatus: ServerStatus;
  serverConfig: LlamaServerConfig;
  setServerConfig: (config: Partial<LlamaServerConfig>) => void;
  selectLocalModel: (path: string) => Promise<void>;
  fetchServerStatus: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  sampling: SamplingParams;
  setSampling: (sampling: Partial<SamplingParams>) => void;
  selectedBackend: 'local' | 'cloud';
  setSelectedBackend: (backend: 'local' | 'cloud') => void;
  cloudEndpoint: string;
  setCloudEndpoint: (url: string) => void;
  cloudApiKey: string;
  setCloudApiKey: (key: string) => void;
  cloudModel: string;
  setCloudModel: (model: string) => void;
  cloudContextTokens: number;
  setCloudContextTokens: (tokens: number) => void;
  cloudProvider: LlmProviderType;
  setCloudProvider: (provider: LlmProviderType) => void;
  openRouterModels: OpenRouterModelInfo[];
  isLoadingOpenRouterModels: boolean;
  fetchOpenRouterModels: (apiKey?: string) => Promise<void>;
  llmPresets: LlmPreset[];
  activePresetId: string | null;
  fetchLlmPresets: () => Promise<void>;
  applyLlmPreset: (presetId: string) => void;
  saveLlmPreset: (preset: LlmPreset) => Promise<void>;
  deleteLlmPreset: (presetId: string) => Promise<void>;
  hfSearchResults: HfModelSummary[];
  isSearchingHf: boolean;
  hfError: string | null;
  searchHfModels: (query: string) => Promise<void>;
  hfModelFiles: Record<string, HfGgufFile[]>;
  isLoadingHfFiles: Record<string, boolean>;
  fetchHfModelFiles: (modelId: string) => Promise<void>;
  downloadProgress: Record<string, DownloadProgressEvent>;
  downloadGgufModel: (file: HfGgufFile) => Promise<void>;
}

export const createLlmSlice: SliceCreator<LlmSlice> = (set, get) => ({
  scannedModels: [],

  hardware: null,

  layerRecommendation: null,

  fetchHardware: async () => {
    try {
      const hw = await api.getHardwareInfo();
      set({ hardware: hw });
    } catch (e) {
      console.error('Failed to probe hardware:', e);
    }
  },

  fetchLayerRecommendation: async (
    modelSizeMb,
    totalLayers,
    contextSize,
    modelPath,
    cacheTypeK,
    cacheTypeV
  ) => {
    try {
      const rec = await api.getLayerRecommendation(
        modelSizeMb,
        totalLayers,
        contextSize,
        modelPath,
        cacheTypeK,
        cacheTypeV
      );
      set({ layerRecommendation: rec });
    } catch (e) {
      console.error('Failed to get layer recommendation:', e);
    }
  },

  serverStatus: {
    state: 'stopped',
    port: 48596,
    pid: null,
    model_name: null,
    error_message: null,
    recent_logs: [],
  },

  serverConfig: {
    model_path: '',
    port: 48596,
    context_size: 4096,
    gpu_layers: 99,
    flash_attn: true,
    reasoning_mode: false,
  },

  setServerConfig: (config) => {
    set((state) => ({ serverConfig: { ...state.serverConfig, ...config } }));
    get().saveCurrentSettings();
  },

  selectLocalModel: async (path) => {
    if (path === get().serverConfig.model_path) return;
    try {
      // Keep the selected model in sync with the process serving local chat.
      // The next Start loads the newly selected file.
      await api.stopLlamaServer();
      await get().fetchServerStatus();
    } catch (error) {
      console.error('Failed to stop the previous local model:', error);
      return;
    }
    set((state) => {
      const model = state.scannedModels.find((item) => item.path === path);
      const isBonsai = model?.name.toLowerCase().includes('bonsai') ?? path.toLowerCase().includes('bonsai');
      return {
        selectedBackend: 'local',
        serverConfig: {
          ...state.serverConfig,
          model_path: path,
          gpu_layers: 99,
          ...(isBonsai
            ? {
                context_size: model?.recommended_context || 32768,
                cache_type_k: 'q4_0',
                cache_type_v: 'q4_0',
                flash_attn: true,
                reasoning_mode: true,
              }
            : {}),
        },
        sampling: isBonsai
          ? {
              ...state.sampling,
              temperature: 0.7,
              top_p: 0.95,
              top_k: 20,
            }
          : state.sampling,
      };
    });
    await get().saveCurrentSettings();
  },

  fetchServerStatus: async () => {
    try {
      const status = await api.getLlamaServerStatus();
      set({ serverStatus: status });
    } catch (e) {
      console.error('Failed to fetch server status:', e);
    }
  },

  startServer: async () => {
    try {
      await api.startLlamaServer(get().serverConfig);
      await get().fetchServerStatus();
      await get().fetchHardware();
    } catch (e) {
      console.error('Failed to start server:', e);
    }
  },

  stopServer: async () => {
    try {
      await api.stopLlamaServer();
      await get().fetchServerStatus();
      await get().fetchHardware();
    } catch (e) {
      console.error('Failed to stop server:', e);
    }
  },

  sampling: {
    temperature: 0.7,
    top_p: 0.9,
    min_p: 0.05,
    max_tokens: 2048,
  },

  setSampling: (sampling) => {
    set((state) => ({ sampling: { ...state.sampling, ...sampling } }));
    get().saveCurrentSettings();
  },

  selectedBackend: 'local',

  setSelectedBackend: (selectedBackend) => {
    set({ selectedBackend });
    get().saveCurrentSettings();
  },

  cloudEndpoint: 'https://openrouter.ai/api/v1/chat/completions',

  setCloudEndpoint: (cloudEndpoint) => {
    set({ cloudEndpoint });
    get().saveCurrentSettings();
  },

  cloudApiKey: '',

  setCloudApiKey: (cloudApiKey) => {
    set({ cloudApiKey });
    get().saveCurrentSettings();
  },

  cloudModel: CLOUD_PROVIDER_DEFAULTS.open_router!.model,

  setCloudModel: (cloudModel) => {
    set({ cloudModel });
    get().saveCurrentSettings();
  },

  cloudContextTokens: 32768,

  setCloudContextTokens: (cloudContextTokens) => {
    set({ cloudContextTokens });
    get().saveCurrentSettings();
  },

  cloudProvider: 'open_router',

  setCloudProvider: (cloudProvider) => {
    const defaults = CLOUD_PROVIDER_DEFAULTS[cloudProvider];
    const endpoint =
      cloudProvider === 'local_llama'
        ? `http://127.0.0.1:${get().serverConfig.port}/v1/chat/completions`
        : defaults?.endpoint ?? get().cloudEndpoint;
    set({ cloudProvider, cloudEndpoint: endpoint, cloudModel: defaults?.model ?? get().cloudModel });
    get().saveCurrentSettings();
  },

  openRouterModels: [],

  isLoadingOpenRouterModels: false,

  fetchOpenRouterModels: async (apiKey?: string) => {
    set({ isLoadingOpenRouterModels: true });
    try {
      const models = await api.fetchOpenRouterModels(apiKey || get().cloudApiKey);
      set({ openRouterModels: models, isLoadingOpenRouterModels: false });
    } catch (e) {
      console.error('Failed to fetch OpenRouter models:', e);
      set({ isLoadingOpenRouterModels: false });
    }
  },

  llmPresets: [],

  activePresetId: null,

  fetchLlmPresets: async () => {
    try {
      const presets = await api.loadLlmPresets();
      set({ llmPresets: presets });
    } catch (e) {
      console.error('Failed to load LLM presets:', e);
    }
  },

  applyLlmPreset: (presetId: string) => {
    const preset = get().llmPresets.find((p) => p.id === presetId);
    if (preset) {
      set({
        activePresetId: presetId,
        sampling: { ...preset.sampling },
      });
      get().saveCurrentSettings();
    }
  },

  saveLlmPreset: async (preset: LlmPreset) => {
    try {
      const updated = await api.saveLlmPreset(preset);
      set({ llmPresets: updated, activePresetId: preset.id });
    } catch (e) {
      console.error('Failed to save LLM preset:', e);
    }
  },

  deleteLlmPreset: async (presetId: string) => {
    try {
      const updated = await api.deleteLlmPreset(presetId);
      set({
        llmPresets: updated,
        activePresetId: get().activePresetId === presetId ? null : get().activePresetId,
      });
    } catch (e) {
      console.error('Failed to delete LLM preset:', e);
    }
  },

  hfSearchResults: [],

  isSearchingHf: false,

  hfError: null,

  searchHfModels: async (query: string) => {
    set({ isSearchingHf: true, hfError: null });
    try {
      const results = await api.searchHfModels(query);
      set({ hfSearchResults: results, isSearchingHf: false });
    } catch (e) {
      console.error('Failed to search HF models:', e);
      set({
        isSearchingHf: false,
        hfError: errorMessage(e),
      });
    }
  },

  hfModelFiles: {},

  isLoadingHfFiles: {},

  fetchHfModelFiles: async (modelId: string) => {
    set((state) => ({
      isLoadingHfFiles: { ...state.isLoadingHfFiles, [modelId]: true },
    }));
    try {
      const files = await api.getHfModelFiles(modelId);
      set((state) => ({
        hfModelFiles: { ...state.hfModelFiles, [modelId]: files },
        isLoadingHfFiles: { ...state.isLoadingHfFiles, [modelId]: false },
      }));
    } catch (e) {
      console.error('Failed to fetch HF model files:', e);
      set((state) => ({
        isLoadingHfFiles: { ...state.isLoadingHfFiles, [modelId]: false },
      }));
    }
  },

  downloadProgress: {},

  downloadGgufModel: async (file: HfGgufFile) => {
    set({ hfError: null });
    try {
      const modelPath = await api.downloadGgufModel(file);
      const models = await api.scanModels();
      set({ scannedModels: models });
      await get().selectLocalModel(modelPath);
    } catch (e) {
      console.error('Failed to download GGUF model:', e);
      set({ hfError: errorMessage(e) });
    }
  },
});
