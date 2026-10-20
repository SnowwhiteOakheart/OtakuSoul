import { api } from '../../services/api';
import { normalizeReplyLanguage, CLOUD_PROVIDER_DEFAULTS, type AppTab, type IntegrationsTab, type SettingsSection } from '../helpers';
import type {
  AppPaths,
  AppSettings,
  LogEntry,
  ReplyReplacement,
  UpdateInfo,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { reportFailure } from '../reportFailure';
import { translate } from '../../i18n';
import { DEFAULT_CONTEXT_SIZE, serverTuningDefaults } from '../../utils/settingDefaults';
import { toast } from '../../components/ui/feedback';
import { errorMessage } from '../../utils/errors';
import { SHIPPED_LANGUAGES, forgetLocales, loadLocale, loadOptions, type SupportedLanguage } from '../../i18n/registry';
import type { UiLanguage } from '../../types/generated/UiLanguage';
import type { ProactiveSettings } from '../../types/generated/ProactiveSettings';
import type { ProactiveSent } from '../../types/generated/ProactiveSent';
import type { QuickReply } from '../../types/generated/QuickReply';
import { PROACTIVE_DEFAULTS, PROACTIVE_SENT_KEPT } from '../../utils/proactive';
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
  /**
   * True once `initApp` applied settings.json. Before that nothing is saved (it would write
   * defaults over the user's settings) and no character is picked automatically.
   */
  settingsLoaded: boolean;
  saveCurrentSettings: () => Promise<void>;
  appLanguage: SupportedLanguage;
  setAppLanguage: (lang: SupportedLanguage) => void;
  /** Interface languages found as JSON files (shipped and in the user folder). */
  availableLanguages: UiLanguage[];
  /** Scans the language folders again and rereads the current language (after editing a file). */
  refreshLanguages: () => Promise<UiLanguage[]>;
  /** Counts rereads of the language files; `useTranslation` re-renders on a change. */
  localeRevision: number;
  /** Copies a language file into the user folder and lists it; returns the new language. */
  importUiLanguage: (path: string) => Promise<UiLanguage | undefined>;
  /** Removes the user's own file for `id`; German takes over if the language is gone then. */
  removeUiLanguage: (id: string) => Promise<void>;
  theme: string;
  setTheme: (theme: string) => void;
  colorMode: ColorModePreference;
  setColorMode: (mode: ColorModePreference) => void;
  /** False only on a fresh install; shows the first-run wizard. */
  onboardingCompleted: boolean;
  completeOnboarding: () => void;
  /** Closing the window hides it into the tray instead of quitting. */
  closeToTray: boolean;
  setCloseToTray: (on: boolean) => void;
  /** A reply that nearly repeats a recent one is written anew once (new swipe). */
  rerollRepeats: boolean;
  setRerollRepeats: (on: boolean) => void;
  /** Content for adults (NSFW hub source, installed NSFW content); counts only with `adultConfirmed`. */
  nsfwEnabled: boolean;
  /** The user confirmed once to be at least 18 (no birth date stored). */
  adultConfirmed: boolean;
  /** Turns adult content on (with the age confirmation, given once) or off. */
  setNsfwEnabled: (on: boolean, confirmAge?: boolean) => Promise<void>;
  /** Words and phrases the AI is asked not to use. */
  avoidPhrases: string[];
  setAvoidPhrases: (phrases: string[]) => void;
  /** Find/replace rules for every reply (expert mode). */
  replyReplacements: ReplyReplacement[];
  setReplyReplacements: (rules: ReplyReplacement[]) => void;
  /** The chat model may use tools (date/time, calculator, web search). */
  chatTools: boolean;
  setChatTools: (on: boolean) => void;
  /** The chat character writes on their own after a pause or when a plan is due (opt-in). */
  proactive: ProactiveSettings;
  setProactive: (patch: Partial<ProactiveSettings>) => void;
  /** Whether `charId` may write on their own (and the switch per character). */
  setProactiveMuted: (charId: string, muted: boolean) => void;
  /** Notes a message the character wrote on their own (keeps the latest few). */
  recordProactive: (sent: ProactiveSent) => void;
  /** Buttons above the chat input with prepared messages. */
  quickReplies: QuickReply[];
  setQuickReplies: (replies: QuickReply[]) => void;
  /** The first-close hint about the tray was confirmed. */
  trayHintShown: boolean;
  /** Scene Stage reopens on the next start; empty = Stage starts with the story gallery. */
  stageLastScene: string;
  /** Page the app opens with. */
  startTab: 'home' | 'chat';
  setStartTab: (tab: 'home' | 'chat') => void;
  /** Technical options are visible (server tuning, raw sampler values, prompt editor, GPU and logs). */
  expertMode: boolean;
  setExpertMode: (on: boolean) => void;
  /** Shows the first-run wizard again (start page: "set up the AI"). */
  reopenOnboarding: () => void;
  confirmTrayHint: () => Promise<void>;
  /** Settings section to open next time the settings view mounts. */
  pendingSettingsSection: SettingsSection | null;
  openSettingsSection: (section: SettingsSection) => void;
  /** Open tab of the integrations view, kept in the store so other places can jump there. */
  integrationsTab: IntegrationsTab;
  setIntegrationsTab: (tab: IntegrationsTab) => void;
  consumePendingSettingsSection: () => SettingsSection | null;
  isLogViewerOpen: boolean;
  setIsLogViewerOpen: (open: boolean) => void;
  isUpdaterOpen: boolean;
  setIsUpdaterOpen: (open: boolean) => void;
  /** Help dialog (first steps, glossary). */
  isHelpOpen: boolean;
  setIsHelpOpen: (open: boolean) => void;
  isPersonaManagerOpen: boolean;
  setIsPersonaManagerOpen: (open: boolean) => void;
  logs: LogEntry[];
  fetchLogs: (maxLines?: number) => Promise<void>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<string>;
  updateInfo: UpdateInfo | null;
  checkForUpdates: () => Promise<UpdateInfo | null>;
}

/** `initApp` subscribed to language changes from the data repository. */
let languagesListening = false;

/** The current settings-save failure was already shown. */
let settingsSaveFailureShown = false;

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
      void get().refreshAvatarMotions();

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
      // A missing language file falls back to German text.
      const listed = await api.listUiLanguages().catch(() => null);
      const languages = listed?.length ? listed : get().availableLanguages;
      const language = languages.find((l) => l.id === (settings.app_language || 'de'));
      set({ availableLanguages: languages });
      await loadLocale(settings.app_language || 'de', loadOptions(language)).catch(() => {});
      if (!languagesListening) {
        // Languages from the data repository arrive after the start.
        languagesListening = true;
        void api.onUiLanguagesChanged(() => void get().refreshLanguages().catch(() => {})).catch(() => {});
      }

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
        cloudContextTokens: settings.cloud_context_tokens || 32768,
        promptTemplate: settings.prompt_template ?? null,
        activePresetId: settings.active_preset_id || null,
        replyLanguage: normalizeReplyLanguage(settings.reply_language),
        lorebookScanDepth: settings.lorebook_scan_depth || 5,
        activeVrmPath: vrmPath,
        activeLive2dPath: settings.active_live2d_path || null,
        globalLorebookIds: settings.global_lorebooks || [],
        sceneTensionEnabled: settings.scene_tension_enabled !== false,
        avatarMode: settings.avatar_mode || '2d',
        appLanguage: settings.app_language || 'de',
        theme: settings.theme || 'obsidian',
        colorMode,
        onboardingCompleted: settings.onboarding_completed !== false,
        closeToTray: settings.close_to_tray !== false,
        rerollRepeats: settings.reroll_repeats !== false,
        nsfwEnabled: settings.nsfw_enabled === true,
        adultConfirmed: settings.adult_confirmed === true,
        avoidPhrases: settings.avoid_phrases ?? [],
        replyReplacements: settings.reply_replacements ?? [],
        chatTools: settings.chat_tools === true,
        proactive: { ...PROACTIVE_DEFAULTS, ...settings.proactive },
        quickReplies: settings.quick_replies ?? [],
        trayHintShown: settings.tray_hint_shown === true,
        stageLastScene: settings.stage_last_scene || '',
        startTab: settings.start_tab === 'chat' ? 'chat' : 'home',
        expertMode: settings.expert_mode === true,
        // The app opens on the start page unless the user goes straight to the chat (or already moved on).
        ...(settings.start_tab !== 'chat' && get().activeTab === 'chat' ? { activeTab: 'home' as const } : {}),
        settingsLoaded: true,
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

      // 5. Scan Characters (opening the last one right away), Lorebooks & Live2D Models
      await get().refreshCharacters(settings.active_character_id);

      // The local model's context: one chosen here (none saved yet) gets the model's tuning and the
      // context that fits the graphics memory. A profile still on the bare default context was never
      // fitted (e.g. a model chosen this way by an older version) and is fitted once; the expert
      // mode keeps a context set by hand. After opening the character: an await before it would let the
      // chat view pick the first character in the meantime.
      const autoChosen = !settings.server_config.model_path && !!modelPath;
      const neverFitted = !!modelPath && !settings.expert_mode && settings.server_config.context_size === DEFAULT_CONTEXT_SIZE;
      if (autoChosen) {
        set((state) => ({ serverConfig: { ...state.serverConfig, ...serverTuningDefaults(modelPath), gpu_layers: 99 } }));
      }
      if (autoChosen || neverFitted) {
        await get().fitServerToModel();
        await get().saveCurrentSettings();
      }
      await get().refreshLorebooks();
      await get().refreshLive2dModels();

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

  settingsLoaded: false,

  saveCurrentSettings: async () => {
    if (!get().settingsLoaded) return;
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
        cloud_context_tokens: state.cloudContextTokens,
        prompt_template: state.promptTemplate ?? undefined,
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
        close_to_tray: state.closeToTray,
        reroll_repeats: state.rerollRepeats,
        nsfw_enabled: state.nsfwEnabled,
        adult_confirmed: state.adultConfirmed,
        avoid_phrases: state.avoidPhrases,
        reply_replacements: state.replyReplacements,
        chat_tools: state.chatTools,
        proactive: state.proactive,
        quick_replies: state.quickReplies,
        tray_hint_shown: state.trayHintShown,
        stage_last_scene: state.stageLastScene,
        start_tab: state.startTab,
        expert_mode: state.expertMode,
      };
      await api.saveSettings(settings);
      settingsSaveFailureShown = false;
    } catch (e) {
      console.error('Failed to save settings:', e);
      // Saving runs on every change; a lasting cause (full disk, read-only folder) is shown once,
      // and again only after a save in between succeeded.
      if (!settingsSaveFailureShown) {
        settingsSaveFailureShown = true;
        toast.error(translate('settings.saveFailed', { error: errorMessage(e) }));
      }
    }
  },

  appLanguage: 'de',

  availableLanguages: SHIPPED_LANGUAGES,

  localeRevision: 0,

  refreshLanguages: async () => {
    const languages = await api.listUiLanguages();
    const lang = get().appLanguage;
    const language = languages.find((l) => l.id === lang);
    forgetLocales();
    await loadLocale(lang, loadOptions(language, true)).catch(() => {});
    set({ availableLanguages: languages, localeRevision: get().localeRevision + 1 });
    return languages;
  },

  importUiLanguage: async (path) => {
    const id = await api.importUiLanguage(path);
    const languages = await get().refreshLanguages();
    return languages.find((l) => l.id === id);
  },

  removeUiLanguage: async (id) => {
    await api.removeUiLanguage(id);
    const languages = await get().refreshLanguages();
    if (id === get().appLanguage && !languages.some((l) => l.id === id)) get().setAppLanguage('de');
  },

  setAppLanguage: (lang) => {
    const language = get().availableLanguages.find((l) => l.id === lang);
    // Switch once the language is loaded; until then the old one stays.
    void loadLocale(lang, loadOptions(language))
      .catch(() => {})
      .then(() => {
        set({ appLanguage: lang });
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang;
        }
        get().saveCurrentSettings();
      });
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

  closeToTray: true,

  setCloseToTray: (on) => {
    set({ closeToTray: on });
    get().saveCurrentSettings();
  },

  rerollRepeats: true,

  nsfwEnabled: false,

  adultConfirmed: false,

  setNsfwEnabled: async (on, confirmAge) => {
    const adultConfirmed = get().adultConfirmed || confirmAge === true;
    // Without a confirmed age adult content stays off. Saved before anything reloads: the backend
    // reads the setting from the file.
    set({ nsfwEnabled: on && adultConfirmed, adultConfirmed });
    await get().saveCurrentSettings();
    // Installed adult content shows or hides (the backend lists it by the saved setting).
    await Promise.all([
      get().refreshCharacters(get().activeCharacter?.id),
      get().refreshLorebooks(),
      get().fetchStageScenes(),
    ]).catch((e) => console.warn('Reloading after the adult content switch failed:', e));
  },

  setRerollRepeats: (on) => {
    set({ rerollRepeats: on });
    get().saveCurrentSettings();
  },

  avoidPhrases: [],

  setAvoidPhrases: (phrases) => {
    set({ avoidPhrases: phrases.map((p) => p.trim()).filter(Boolean) });
    get().saveCurrentSettings();
  },

  replyReplacements: [],

  setReplyReplacements: (rules) => {
    set({ replyReplacements: rules });
    get().saveCurrentSettings();
  },

  chatTools: false,

  setChatTools: (on) => {
    set({ chatTools: on });
    get().saveCurrentSettings();
  },

  proactive: PROACTIVE_DEFAULTS,

  setProactive: (patch) => {
    set({ proactive: { ...get().proactive, ...patch } });
    get().saveCurrentSettings();
  },

  setProactiveMuted: (charId, muted) => {
    const others = get().proactive.muted_character_ids.filter((id) => id !== charId);
    get().setProactive({ muted_character_ids: muted ? [...others, charId] : others });
  },

  quickReplies: [],

  setQuickReplies: (quickReplies) => {
    set({ quickReplies });
    get().saveCurrentSettings();
  },

  recordProactive: (sent) => {
    get().setProactive({ sent: [...get().proactive.sent, sent].slice(-PROACTIVE_SENT_KEPT) });
  },

  trayHintShown: false,
  stageLastScene: '',
  startTab: 'home',
  setStartTab: (startTab) => {
    set({ startTab });
    get().saveCurrentSettings();
  },
  reopenOnboarding: () => set({ onboardingCompleted: false }),
  expertMode: false,
  setExpertMode: (expertMode) => {
    set({ expertMode });
    get().saveCurrentSettings();
  },

  confirmTrayHint: async () => {
    set({ trayHintShown: true });
    // Saved before hiding: the next close reads the flag from settings.json.
    await get().saveCurrentSettings();
  },

  pendingSettingsSection: null,

  integrationsTab: 'web',

  setIntegrationsTab: (integrationsTab) => set({ integrationsTab }),

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
  isHelpOpen: false,
  setIsHelpOpen: (isHelpOpen) => set({ isHelpOpen }),

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
      reportFailure('Failed to clear app logs:', e);
    }
  },

  exportLogs: async () => {
    try {
      return await api.exportAppLogs();
    } catch (e) {
      console.error('Failed to export app logs:', e);
      throw e;
    }
  },

  updateInfo: null,

  checkForUpdates: async () => {
    try {
      const info = await api.checkForUpdates();
      set({ updateInfo: info });
      return info;
    } catch (e) {
      reportFailure('Failed to check for updates:', e);
      return null;
    }
  },
});
