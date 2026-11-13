import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { OpenRouterLogin } from '../../types/generated/OpenRouterLogin';
import type { UiLanguage } from '../../types/generated/UiLanguage';
import type {
  AppPaths,
  AppSettings,
  BenchmarkResult,
  ChatLora,
  DiskSpace,
  DownloadProgressEvent,
  HardwareInfo,
  HfGgufFile,
  HfModelSummary,
  LayerRecommendation,
  LlamaServerConfig,
  LlmPreset,
  LogEntry,
  ModelDefaults,
  OpenRouterModelInfo,
  QuickReplyRequest,
  RuntimeInfo,
  RuntimeKind,
  RuntimeProgress,
  RuntimeVariant,
  ScannedModel,
  ServerStatus,
  StarterModel,
  UpdateInfo,
  UserPersona,
} from '../../types';

export const systemApi = {
  // Hardware
  getHardwareInfo: async (): Promise<HardwareInfo> => {
    return await invoke<HardwareInfo>('get_hardware_info');
  },

  getLayerRecommendation: async (
    modelSizeMb: number,
    totalLayers: number,
    contextSize: number,
    modelPath?: string,
    cacheTypeK?: string,
    cacheTypeV?: string
  ): Promise<LayerRecommendation> => {
    return await invoke<LayerRecommendation>('get_layer_recommendation', {
      modelSizeMb,
      totalLayers,
      contextSize,
      modelPath,
      cacheTypeK,
      cacheTypeV,
    });
  },

  // Llama Server
  startLlamaServer: async (config: LlamaServerConfig): Promise<void> => {
    return await invoke<void>('start_llama_server', { config });
  },

  stopLlamaServer: async (): Promise<void> => {
    return await invoke<void>('stop_llama_server');
  },

  getLlamaServerStatus: async (): Promise<ServerStatus> => {
    return await invoke<ServerStatus>('get_llama_server_status');
  },

  /** "Sign in with OpenRouter" in the browser; resolves with the account's key once signed in. */
  openRouterLogin: async (language: string): Promise<OpenRouterLogin> => {
    return await invoke<OpenRouterLogin>('openrouter_login', { language });
  },

  openRouterLoginCancel: async (): Promise<void> => {
    await invoke('openrouter_login_cancel');
  },

  readFileBinary: async (filePath: string): Promise<Uint8Array> => {
    // Raw bytes over IPC (an ArrayBuffer), not a JSON number list.
    return new Uint8Array(await invoke<ArrayBuffer>('read_file_binary', { filePath }));
  },

  // Paths, Locales & Folders
  getAppPaths: async (): Promise<AppPaths> => {
    return await invoke<AppPaths>('get_app_paths');
  },

  /** Interface languages from the shipped and the user folder. */
  listUiLanguages: async (): Promise<UiLanguage[]> => {
    return await invoke('list_ui_languages');
  },

  /** All texts of one interface language (shipped file plus the user's changes). */
  loadUiLanguage: async (id: string): Promise<Record<string, string>> => {
    return await invoke('load_ui_language', { id });
  },

  /** Copies a language file into the user folder; returns the language id. */
  importUiLanguage: async (path: string): Promise<string> => {
    return await invoke('import_ui_language', { path });
  },

  /** Removes the user's own file for a language (shipped and downloaded texts stay). */
  removeUiLanguage: async (id: string): Promise<void> => {
    await invoke('remove_ui_language', { id });
  },

  /** The data repository brought new or changed interface languages (start-up download). */
  onUiLanguagesChanged: async (callback: () => void): Promise<UnlistenFn> => {
    return await listen('ui-languages-changed', () => callback());
  },

  /** Opens the folder for own translations (with `_template.json` to copy). */
  openUiLocalesFolder: async (): Promise<void> => {
    await invoke('open_ui_locales_folder');
  },

  openAvatarFolder: async (): Promise<void> => {
    await invoke('open_avatar_folder');
  },

  // Local Models & Settings
  scanModels: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_models');
  },

  scanLoras: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_loras');
  },

  /** `mmproj-*.gguf` files that let a local model see images. */
  scanVisionProjectors: async (): Promise<ScannedModel[]> => {
    return await invoke<ScannedModel[]>('scan_vision_projectors');
  },

  loadSettings: async (): Promise<AppSettings> => {
    return await invoke<AppSettings>('load_settings');
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    return await invoke<void>('save_settings', { settings });
  },

  loadPersonas: async (): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('load_personas');
  },

  savePersona: async (persona: UserPersona): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('save_persona', { persona });
  },

  deletePersona: async (personaId: string): Promise<UserPersona[]> => {
    return await invoke<UserPersona[]>('delete_persona', { personaId });
  },

  // LLM Provider, Presets & Models Hub
  fetchOpenRouterModels: async (
    apiKey?: string | null
  ): Promise<OpenRouterModelInfo[]> => {
    return await invoke<OpenRouterModelInfo[]>('fetch_openrouter_models', {
      apiKey: apiKey ?? null,
    });
  },

  loadLlmPresets: async (): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('load_llm_presets');
  },

  saveLlmPreset: async (preset: LlmPreset): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('save_llm_preset', { preset });
  },

  deleteLlmPreset: async (presetId: string): Promise<LlmPreset[]> => {
    return await invoke<LlmPreset[]>('delete_llm_preset', { presetId });
  },

  searchHfModels: async (query: string): Promise<HfModelSummary[]> => {
    return await invoke<HfModelSummary[]>('search_hf_models', { query });
  },

  getHfModelFiles: async (modelId: string): Promise<HfGgufFile[]> => {
    return await invoke<HfGgufFile[]>('get_hf_model_files', { modelId });
  },

  /** One short answer outside a chat (connection test, first reply in the setup wizard). */
  quickReply: async (request: QuickReplyRequest): Promise<string> => {
    return await invoke<string>('quick_reply', { request });
  },

  /** Server and sampler values families of local models need (from the model catalog). */
  getModelDefaults: async (): Promise<ModelDefaults[]> => {
    return await invoke<ModelDefaults[]>('get_model_defaults');
  },

  /** Free disk space where models are downloaded to (MB). */
  diskSpace: async (): Promise<DiskSpace> => {
    return await invoke<DiskSpace>('disk_space');
  },

  /** Speed test of the running local chat model (kept with the earlier results). */
  runLlmBenchmark: async (): Promise<BenchmarkResult> => {
    return await invoke<BenchmarkResult>('run_llm_benchmark');
  },

  /** Kept speed test results, newest first. */
  listLlmBenchmarks: async (): Promise<BenchmarkResult[]> => {
    return await invoke<BenchmarkResult[]>('list_llm_benchmarks');
  },

  clearLlmBenchmarks: async (): Promise<void> => {
    await invoke('clear_llm_benchmarks');
  },

  /** LoRA adapters for chat models from the catalog (adult ones only while 18+ is on). */
  listChatLoras: async (): Promise<ChatLora[]> => {
    return await invoke<ChatLora[]>('list_chat_loras');
  },

  /** Whether the adapter at `path` is one for adults kept off while 18+ is off. */
  chatLoraHidden: async (path: string): Promise<boolean> => {
    return await invoke<boolean>('chat_lora_hidden', { path });
  },

  /** Downloads the catalog adapter `id` (SHA-256 checked) and returns its path. */
  downloadChatLora: async (id: string): Promise<string> => {
    return await invoke<string>('download_chat_lora', { id });
  },

  /** Chat models for getting started, with the recommendation for this GPU. */
  listStarterModels: async (): Promise<StarterModel[]> => {
    return await invoke<StarterModel[]>('list_starter_models');
  },

  downloadGgufModel: async (file: HfGgufFile): Promise<string> => {
    return await invoke<string>('download_gguf_model', {
      downloadUrl: file.download_url,
      filename: file.filename,
      expectedSize: file.size_bytes,
      expectedSha256: file.sha256,
      parts: file.parts?.length ? file.parts : null,
    });
  },

  /** Stops the running GGUF download of `filename`; it then fails with `downloadCancelled`. */
  cancelGgufDownload: async (filename: string): Promise<void> => {
    await invoke('cancel_gguf_download', { filename });
  },

  getRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo | null> => {
    return await invoke<RuntimeInfo | null>('get_runtime', { kind });
  },

  /** The build kept from before the last update (for a rollback). */
  getPreviousRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo | null> => {
    return await invoke<RuntimeInfo | null>('get_previous_runtime', { kind });
  },

  rollbackRuntime: async (kind: RuntimeKind): Promise<RuntimeInfo> => {
    return await invoke<RuntimeInfo>('rollback_runtime', { kind });
  },

  listRuntimeVariants: async (kind: RuntimeKind): Promise<RuntimeVariant[]> => {
    return await invoke<RuntimeVariant[]>('list_runtime_variants', { kind });
  },

  installRuntime: async (kind: RuntimeKind, backend: string): Promise<RuntimeInfo> => {
    return await invoke<RuntimeInfo>('install_runtime', { kind, backend });
  },

  hideMainWindow: async (): Promise<void> => {
    await invoke('hide_main_window');
  },

  quitApp: async (): Promise<void> => {
    await invoke('quit_app');
  },

  /** Close with "keep running in the tray" and no remembered choice: the interface asks first. */
  onCloseToTrayHint: async (callback: () => void): Promise<UnlistenFn> => {
    return await listen('close-to-tray-hint', () => callback());
  },

  onRuntimeProgress: async (callback: (data: RuntimeProgress) => void): Promise<UnlistenFn> => {
    return await listen<RuntimeProgress>('runtime-progress', (event) => callback(event.payload));
  },

  onModelDownloadProgress: async (
    callback: (data: DownloadProgressEvent) => void
  ): Promise<UnlistenFn> => {
    return await listen<DownloadProgressEvent>('model-download-progress', (event) => {
      callback(event.payload);
    });
  },

  // Logging & Updater
  getAppLogs: async (maxLines?: number): Promise<LogEntry[]> => {
    return await invoke<LogEntry[]>('get_app_logs', { maxLines: maxLines || null });
  },

  clearAppLogs: async (): Promise<void> => {
    return await invoke<void>('clear_app_logs');
  },

  exportAppLogs: async (): Promise<string> => {
    return await invoke<string>('export_app_logs');
  },

  checkForUpdates: async (): Promise<UpdateInfo> => {
    return await invoke<UpdateInfo>('check_for_updates');
  },
};
