import { api } from '../../services/api';
import { normalizeReplyLanguage, CLOUD_PROVIDER_DEFAULTS, type AppTab, type SettingsSection } from '../helpers';
import type {
  AppPaths,
  AppSettings,
  LogEntry,
  UpdateInfo,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { normalizeColorMode, syncColorMode, type ColorModePreference } from '../../services/theme';

/** Navigation, app lifecycle (init/save settings), language, theme, onboarding, logs and updater. */
export interface AppSlice {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  hubSubTab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes';
  setHubSubTab: (tab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes') => void;
  openSoulHubTab: (tab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes') => void;
  appPaths: AppPaths | null;
  initApp: () => Promise<void>;
  saveCurrentSettings: () => Promise<void>;
  appLanguage: 'de' | 'en' | 'ru';
  setAppLanguage: (lang: 'de' | 'en' | 'ru') => void;
  theme: string;
  setTheme: (theme: string) => void;
  colorMode: ColorModePreference;
  setColorMode: (mode: ColorModePreference) => void;
  /** False only on a fresh install; shows the first-run wizard. */
  onboardingCompleted: boolean;
  completeOnboarding: () => void;
  /** Settings section to open next time the settings view mounts. */
  pendingSettingsSection: SettingsSection | null;
  openSettingsSection: (section: SettingsSection) => void;
  consumePendingSettingsSection: () => SettingsSection | null;
  isLogViewerOpen: boolean;
  setIsLogViewerOpen: (open: boolean) => void;
  isUpdaterOpen: boolean;
  setIsUpdaterOpen: (open: boolean) => void;
  isPersonaManagerOpen: boolean;
  setIsPersonaManagerOpen: (open: boolean) => void;
  logs: LogEntry[];
  fetchLogs: (maxLines?: number) => Promise<void>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<string>;
  updateInfo: UpdateInfo | null;
  checkForUpdates: () => Promise<UpdateInfo | null>;
}

export const createAppSlice: SliceCreator<AppSlice> = (set, get) => ({
  activeTab: 'chat',

  setActiveTab: (activeTab) => set({ activeTab }),

  hubSubTab: 'soul_gateway',

  setHubSubTab: (hubSubTab) => set({ hubSubTab }),

  openSoulHubTab: (hubSubTab) => set({ activeTab: 'hub', hubSubTab }),

  appPaths: null,

  initApp: async () => {
    try {
      // 1. Get resolved paths
      const paths = await api.getAppPaths();
      set({ appPaths: paths });

      // 2. Load persistent settings
      const settings = await api.loadSettings();

      // 3. Scan models and VRMs
      const models = await api.scanModels();
      const vrms = await api.scanVrmModels();
      set({ scannedModels: models, scannedVrms: vrms });

      // If settings model path is empty or not in scan, choose first available
      let modelPath = settings.server_config.model_path;
      if (!modelPath) {
        modelPath = models[0]?.path ?? modelPath;
      }

      let vrmPath = settings.active_vrm_path;
      if (!vrmPath) {
        vrmPath = vrms[0]?.path ?? vrmPath;
      }

      const colorMode = normalizeColorMode(settings.color_mode);

      set({
        serverConfig: {
          ...settings.server_config,
          model_path: modelPath,
        },
        sampling: settings.sampling || {
          temperature: 0.7,
          top_p: 0.9,
          min_p: 0.05,
          max_tokens: 2048,
        },
        selectedBackend: settings.selected_backend || 'local',
        cloudProvider: settings.cloud_provider || 'open_router',
        cloudEndpoint: settings.cloud_endpoint || 'https://openrouter.ai/api/v1/chat/completions',
        cloudApiKey: settings.cloud_api_key || '',
        cloudModel: settings.cloud_model || CLOUD_PROVIDER_DEFAULTS.open_router!.model,
        activePresetId: settings.active_preset_id || null,
        replyLanguage: normalizeReplyLanguage(settings.reply_language),
        lorebookScanDepth: settings.lorebook_scan_depth || 5,
        activeVrmPath: vrmPath,
        activeLive2dPath: settings.active_live2d_path || null,
        globalLorebookIds: settings.global_lorebooks || [],
        sceneTensionEnabled: settings.scene_tension_enabled !== false,
        avatarMode: settings.avatar_mode || '3d',
        appLanguage: settings.app_language || 'de',
        theme: settings.theme || 'obsidian',
        colorMode,
        onboardingCompleted: settings.onboarding_completed !== false,
      });

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', settings.theme || 'obsidian');
        document.documentElement.lang = settings.app_language || 'de';
      }
      syncColorMode(colorMode);

      // 3b. Load LLM Presets & listen to model downloads
      try {
        const presets = await api.loadLlmPresets();
        set({ llmPresets: presets });
      } catch (err) {
        console.warn('Failed to load presets:', err);
      }

      try {
        await api.onModelDownloadProgress((prog) => {
          set((state) => ({
            downloadProgress: {
              ...state.downloadProgress,
              [prog.filename]: prog,
            },
          }));
          if (prog.finished) {
            api.scanModels().then((scanned) => {
              set({ scannedModels: scanned });
            });
          }
        });
      } catch (err) {
        console.warn('Failed to attach download progress listener:', err);
      }

      // 4. Load Personas
      const loadedPersonas = await api.loadPersonas();
      if (loadedPersonas.length > 0) {
        const foundPersona = loadedPersonas.find((p) => p.id === settings.active_persona_id);
        set({
          personas: loadedPersonas,
          activePersona: foundPersona || loadedPersonas[0],
        });
      }

      // 5. Scan Characters, Lorebooks & Live2D Models
      await get().refreshCharacters();
      await get().refreshLorebooks();
      await get().refreshLive2dModels();

      // If active character was saved in settings, restore it
      if (settings.active_character_id) {
        const char = get().availableCharacters.find((c) => c.id === settings.active_character_id);
        if (char) {
          await get().selectCharacter(char);
        }
      }

      // 6. Initialize Companion State & MCP Ecosystem
      await get().fetchCompanionState();
      await get().fetchMcpServers();
      await get().fetchCompanionPlugins();
      await get().fetchEnvironmentSnapshot();

      // 7. Initialize Phase 17 Ecosystem (Backups, ImageGen, Discord, WebServer)
      await get().fetchBackups();
      await get().fetchImageGenConfig();
      await get().fetchDiscordStatus();
      await get().fetchWebServerStatus();
      await get().fetchGeneratedImages();
    } catch (e) {
      console.error('Failed to initialize app state:', e);
    }
  },

  saveCurrentSettings: async () => {
    try {
      const state = get();
      const settings: AppSettings = {
        server_config: state.serverConfig,
        sampling: state.sampling,
        selected_backend: state.selectedBackend,
        cloud_provider: state.cloudProvider,
        cloud_endpoint: state.cloudEndpoint,
        cloud_api_key: state.cloudApiKey,
        cloud_model: state.cloudModel,
        active_preset_id: state.activePresetId,
        reply_language: state.replyLanguage,
        lorebook_scan_depth: state.lorebookScanDepth,
        active_character_id: state.activeCharacter?.id || null,
        active_persona_id: state.activePersona?.id || null,
        active_vrm_path: state.activeVrmPath,
        active_live2d_path: state.activeLive2dPath,
        global_lorebooks: state.globalLorebookIds,
        scene_tension_enabled: state.sceneTensionEnabled,
        avatar_mode: state.avatarMode,
        app_language: state.appLanguage,
        theme: state.theme,
        color_mode: state.colorMode,
        onboarding_completed: state.onboardingCompleted,
      };
      await api.saveSettings(settings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  appLanguage: 'de',

  setAppLanguage: (lang) => {
    set({ appLanguage: lang });
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    get().saveCurrentSettings();
  },

  theme: 'obsidian',

  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    get().saveCurrentSettings();
  },

  colorMode: 'system',

  setColorMode: (colorMode) => {
    set({ colorMode });
    syncColorMode(colorMode);
    get().saveCurrentSettings();
  },

  // Starts as completed so the wizard never flashes before the settings are loaded.
  onboardingCompleted: true,

  completeOnboarding: () => {
    set({ onboardingCompleted: true });
    get().saveCurrentSettings();
  },

  pendingSettingsSection: null,

  openSettingsSection: (section) => set({ pendingSettingsSection: section, activeTab: 'settings' }),

  consumePendingSettingsSection: () => {
    const section = get().pendingSettingsSection;
    if (section) set({ pendingSettingsSection: null });
    return section;
  },

  isLogViewerOpen: false,

  setIsLogViewerOpen: (isLogViewerOpen) => set({ isLogViewerOpen }),

  isUpdaterOpen: false,

  setIsUpdaterOpen: (isUpdaterOpen) => set({ isUpdaterOpen }),

  isPersonaManagerOpen: false,

  setIsPersonaManagerOpen: (isPersonaManagerOpen) => set({ isPersonaManagerOpen }),

  logs: [],

  fetchLogs: async (maxLines) => {
    try {
      const logs = await api.getAppLogs(maxLines);
      set({ logs });
    } catch (e) {
      console.error('Failed to fetch app logs:', e);
    }
  },

  clearLogs: async () => {
    try {
      await api.clearAppLogs();
      set({ logs: [] });
    } catch (e) {
      console.error('Failed to clear app logs:', e);
    }
  },

  exportLogs: async () => {
    try {
      return await api.exportAppLogs();
    } catch (e) {
      console.error('Failed to export app logs:', e);
      return '';
    }
  },

  updateInfo: null,

  checkForUpdates: async () => {
    try {
      const info = await api.checkForUpdates();
      set({ updateInfo: info });
      return info;
    } catch (e) {
      console.error('Failed to check for updates:', e);
      return null;
    }
  },
});
