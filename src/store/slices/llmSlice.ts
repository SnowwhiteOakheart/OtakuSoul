import { api } from '../../services/api';
import { projectorFor } from '../../utils/visionProjector';
import { CLOUD_PROVIDER_DEFAULTS } from '../helpers';
import type {
  DownloadProgressEvent,
  HardwareInfo,
  HfGgufFile,
  HfModelSummary,
  LayerRecommendation,
  LlamaServerConfig,
  LlmPreset,
  LlmProviderType,
  OpenRouterModelInfo,
  PromptTemplate,
  SamplingParams,
  ScannedModel,
  ServerStatus,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { reportFailure } from '../reportFailure';
import { errorCode, errorMessage } from '../../utils/errors';
import { translate } from '../../i18n';
import { trackTask } from './taskSlice';
import { DEFAULT_CONTEXT_SIZE, serverTuningDefaults } from '../../utils/settingDefaults';

/** The task of the model being loaded; the server status says when it is ready. */
let serverTaskId: string | null = null;

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

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
  /** Context size and GPU layers for the chosen model (from its file and the graphics card). */
  fitServerToModel: () => Promise<void>;
  /** Server tuning back to its defaults for the chosen model; returns the old settings for undo. */
  resetServerTuning: () => Promise<LlamaServerConfig>;
  fetchServerStatus: () => Promise<void>;
  /** `quiet`: the caller shows the error itself (no toast). */
  startServer: (options?: { quiet?: boolean }) => Promise<void>;
  /** Starts the local AI if it is chosen but not running, and waits until it answers; throws if it cannot start. */
  ensureLocalAi: () => Promise<void>;
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
  /** Editable chat system prompt; null uses the built-in default. */
  promptTemplate: PromptTemplate | null;
  setPromptTemplate: (template: PromptTemplate | null) => void;
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
  /**
   * Downloads the vision projector of `modelPath` (a starter's `mmproj`) and uses it while that
   * model is selected; the running server restarts with it on the next reply.
   */
  downloadVisionProjector: (file: HfGgufFile, modelPath: string) => Promise<void>;
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
    notice: null,
    recent_logs: [],
  },

  serverConfig: {
    model_path: '',
    port: 48596,
    context_size: DEFAULT_CONTEXT_SIZE,
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
    // The model's own vision projector, or none when the current one belongs to another model.
    const projectors = (await api.scanVisionProjectors().catch(() => null)) ?? [];
    const projector = projectorFor(path, get().serverConfig.mmproj_path, projectors.map((p) => p.path));
    if (projector !== undefined) set((state) => ({ serverConfig: { ...state.serverConfig, mmproj_path: projector } }));
    await get().fitServerToModel();
    await get().saveCurrentSettings();
  },

  fitServerToModel: async () => {
    // Context and GPU layers for the chosen model: what fits into the graphics memory, never more
    // than the model was trained for.
    const config = get().serverConfig;
    if (!config.model_path) return;
    try {
      const model = get().scannedModels.find((item) => item.path === config.model_path);
      const rec = await api.getLayerRecommendation(
        model?.size_mb ?? 0,
        0,
        config.context_size,
        config.model_path,
        config.cache_type_k ?? 'f16',
        config.cache_type_v ?? 'f16',
      );
      set((state) => ({
        layerRecommendation: rec,
        serverConfig: {
          ...state.serverConfig,
          context_size: rec.recommended_context_size,
          gpu_layers: rec.available_vram_mb > 0 ? rec.recommended_layers : state.serverConfig.gpu_layers,
        },
      }));
    } catch (e) {
      console.error('Failed to size the context for the model:', e);
    }
  },

  resetServerTuning: async () => {
    const previous = get().serverConfig;
    set((state) => ({ serverConfig: { ...state.serverConfig, ...serverTuningDefaults(state.serverConfig.model_path) } }));
    await get().fitServerToModel();
    await get().saveCurrentSettings();
    return previous;
  },

  fetchServerStatus: async () => {
    try {
      const status = await api.getLlamaServerStatus();
      set({ serverStatus: status });
      if (serverTaskId && status.state !== 'starting') {
        if (status.state === 'running') get().endTask(serverTaskId, 'done');
        else if (status.state === 'failed') {
          get().endTask(serverTaskId, 'failed', status.error_message ? errorMessage(status.error_message) : undefined);
        }
        else get().endTask(serverTaskId, 'cancelled');
        serverTaskId = null;
      }
    } catch (e) {
      console.error('Failed to fetch server status:', e);
    }
  },

  startServer: async (options) => {
    if (serverTaskId) get().endTask(serverTaskId, 'cancelled');
    // Loading takes from seconds to minutes; the chat waits until the model is in VRAM.
    const id = get().startTask({
      kind: 'model',
      title: translate('task.model', { name: fileName(get().serverConfig.model_path) }),
      status: 'waiting',
      detail: translate('task.modelLoading'),
      cancel: () => void get().stopServer(),
      retry: () => void get().startServer().catch(() => {}),
    });
    serverTaskId = id;
    try {
      await api.startLlamaServer(get().serverConfig);
      await get().fetchServerStatus();
      await get().fetchHardware();
    } catch (e) {
      if (serverTaskId === id) serverTaskId = null;
      get().endTask(id, 'failed', errorMessage(e));
      if (options?.quiet) console.error('Failed to start server:', e);
      else reportFailure('Failed to start server:', e);
      throw e;
    }
  },

  ensureLocalAi: async () => {
    if (get().selectedBackend !== 'local' || !get().serverConfig.model_path) return;
    await get().fetchServerStatus();
    // Someone else is already loading the model: wait for it (up to 5 minutes).
    for (let i = 0; i < 300 && get().serverStatus.state === 'starting'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await get().fetchServerStatus();
    }
    if (get().serverStatus.state === 'running') return;
    await get().startServer({ quiet: true });
  },

  stopServer: async () => {
    try {
      await api.stopLlamaServer();
      await get().fetchServerStatus();
      await get().fetchHardware();
    } catch (e) {
      reportFailure('Failed to stop server:', e);
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

  promptTemplate: null,

  setPromptTemplate: (promptTemplate) => {
    set({ promptTemplate });
    get().saveCurrentSettings();
  },

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
      reportFailure('Failed to save LLM preset:', e);
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
      reportFailure('Failed to delete LLM preset:', e);
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

  downloadVisionProjector: async (file, modelPath) => {
    set({ hfError: null });
    try {
      const task = {
        kind: 'download' as const,
        title: translate('task.download', { name: file.filename }),
        progressKey: file.filename,
        cancel: () => void api.cancelGgufDownload(file.filename),
        retry: () => void get().downloadVisionProjector(file, modelPath),
      };
      const path = await trackTask(get(), task, () => api.downloadGgufModel(file));
      if (get().serverConfig.model_path !== modelPath) return;
      // The server loads a projector only at its start.
      await api.stopLlamaServer().catch(() => undefined);
      await get().fetchServerStatus();
      set((state) => ({ serverConfig: { ...state.serverConfig, mmproj_path: path } }));
      await get().saveCurrentSettings();
    } catch (e) {
      set((state) => {
        const { [file.filename]: _stale, ...downloadProgress } = state.downloadProgress;
        return { downloadProgress };
      });
      if (errorCode(e)?.code === 'backend.models.downloadCancelled') return;
      console.error('Failed to download the vision projector:', e);
      set({ hfError: errorMessage(e) });
    }
  },

  downloadGgufModel: async (file: HfGgufFile) => {
    set({ hfError: null });
    // The backend reports progress by the bare file name, without the repository folder.
    const progressKey = file.filename.split('/').pop() ?? file.filename;
    try {
      const task = {
        kind: 'download' as const,
        title: translate('task.download', { name: progressKey }),
        progressKey,
        cancel: () => void api.cancelGgufDownload(file.filename),
        retry: () => void get().downloadGgufModel(file),
      };
      const modelPath = await trackTask(get(), task, () => api.downloadGgufModel(file));
      const models = await api.scanModels();
      set({ scannedModels: models });
      await get().selectLocalModel(modelPath);
    } catch (e) {
      // The progress of a stopped or failed download would otherwise stay half full.
      set((state) => {
        const { [progressKey]: _stale, ...downloadProgress } = state.downloadProgress;
        return { downloadProgress };
      });
      // A stop by the user is no error; the task list shows it as cancelled.
      if (errorCode(e)?.code === 'backend.models.downloadCancelled') return;
      console.error('Failed to download GGUF model:', e);
      set({ hfError: errorMessage(e) });
    }
  },
});
