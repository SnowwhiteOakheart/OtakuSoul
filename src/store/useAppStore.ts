import { create } from 'zustand';
import { translate } from '../i18n';
import { api } from '../services/api';
import {
  HardwareInfo,
  ServerStatus,
  LlamaServerConfig,
  ChatMessage,
  LayerRecommendation,
  CharacterProfile,
  Lorebook,
  LorebookEntry,
  StateVariable,
  CognitiveOverview,
  PsychologyState,
  RelationshipState,
  DiaryEntry,
  MemoryBackupInfo,
  SoulMemoryPipelineResult,
  StageState,
  ScenePreview,
  SceneDefinition,
  SceneState,
  StageTurnRequest,
  WorldState,
  CampaignClock,
  CombatCondition,
  DiceRollResult,
  ToolCallRequest,
  ToolExecutionResult,
  CompanionSettings,
  CompanionState,
  AppPaths,
  ScannedModel,
  ScannedVrm,
  SamplingParams,
  UserPersona,
  AppSettings,
  ChatSession,
  StoredChatMessage,
  LlmProviderType,
  OpenRouterModelInfo,
  LlmPreset,
  HfModelSummary,
  HfGgufFile,
  DownloadProgressEvent,
  VoiceConfig,
  ScannedLive2d,
  EmotionResult,
  Goal,
  EnvironmentSnapshot,
  McpServerConfig,
  CompanionPlugin,
  BackupGroupSelection,
  BackupEntryInfo,
  ImageGenConfig,
  GeneratedImageResult,
  GeneratedImageInfo,
  DiscordBotConfig,
  DiscordBotStatus,
  WebServerConfig,
  WebServerStatus,
  CharacterDraft,
  LogEntry,
  UpdateInfo,
} from '../types';
import { soundFx } from '../services/soundFx';
import { extractStateUpdates, applyStateUpdates } from '../utils/stateParser';
import { HUD_PRESETS } from '../constants/hudPresets';

async function resolvePromptWithLore(
  state: AppStoreState,
  recentMessages: ChatMessage[],
  latestUserText?: string,
): Promise<string> {
  const {
    activeCharacter,
    activePersona,
    stateVariables,
    cognitiveOverview,
    replyLanguage,
    serverConfig,
    chatSessions,
    activeChatId,
    lorebookScanDepth,
    allLorebooks,
    activeLorebooks,
    globalLorebookIds,
    currentTension,
    sceneTensionEnabled,
  } = state;

  if (!activeCharacter) return '';

  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const scanDepth = Math.max(1, lorebookScanDepth || 5);
  const recentContext = recentMessages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join(' ');

  // 1. Gather all candidate lorebooks (bound to character or global)
  const boundSet = new Set(activeCharacter.bound_lorebooks || []);
  const globalSet = new Set(globalLorebookIds || []);

  let candidateLorebooks = allLorebooks.filter(
    (lb) =>
      (lb.id && boundSet.has(lb.id)) ||
      (lb.file_path && boundSet.has(lb.file_path)) ||
      lb.is_global ||
      (lb.id && globalSet.has(lb.id)) ||
      (lb.file_path && globalSet.has(lb.file_path))
  );

  if (candidateLorebooks.length === 0) {
    candidateLorebooks = activeLorebooks.length > 0 ? activeLorebooks : allLorebooks;
  }

  // 2. Scene Tension Accumulator
  let effectiveTension = currentTension;
  if (sceneTensionEnabled) {
    let tensionDelta = 2; // base increment per turn
    if (latestUserText) {
      const dangerRegex =
        /\b(gefahr|kampf|angriff|monster|schrei|wache|feind|dunkelheit|schwert|blut|waffe|flucht|falle|bedrohung|boss|attack|danger|enemy|fight|threat|kill|trap)\b/i;
      if (dangerRegex.test(latestUserText)) {
        tensionDelta += 10;
      }
    }
    effectiveTension = Math.min(100, Math.max(0, currentTension + tensionDelta));
  }

  // 3. Evaluate lorebooks
  let passiveEntries: LorebookEntry[] = [];
  let activeDirectives: LorebookEntry[] = [];

  if (candidateLorebooks.length > 0) {
    try {
      const evalRes = await api.evaluateMultiLorebooks(
        candidateLorebooks,
        recentContext,
        effectiveTension
      );
      passiveEntries = evalRes.passive_entries;
      activeDirectives = evalRes.active_entries;

      if (evalRes.triggered_tension_events.length > 0) {
        soundFx.playWarning();
        state.setCurrentTension(evalRes.new_tension);
      } else if (sceneTensionEnabled) {
        state.setCurrentTension(effectiveTension);
      }
    } catch (e) {
      console.warn('Failed evaluateMultiLorebooks, falling back:', e);
      for (const lb of candidateLorebooks) {
        const entries = await api.evaluateLorebookContext(lb, recentContext);
        passiveEntries.push(...entries);
      }
    }
  }

  // 4. Assemble system prompt
  return await api.assemblePrompt({
    char_name: activeCharacter.card.data.name,
    user_name: activePersona.name,
    character: activeCharacter.card.data,
    active_lore: passiveEntries,
    active_directives: activeDirectives,
    state_variables: stateVariables,
    cognitive: cognitiveOverview || undefined,
    reply_language: replyLanguage || 'Deutsch',
    allow_reasoning: serverConfig.reasoning_mode,
    author_note: activeSession?.author_note,
    author_note_depth: activeSession?.author_note_depth,
  });
}

/**
 * The reply language is written verbatim into the system prompt, so it must be a language
 * name. Older settings UI versions stored ISO codes ("en"), which the model then saw as-is.
 */
const REPLY_LANGUAGE_BY_CODE: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  ru: 'Русский',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
};
export const normalizeReplyLanguage = (value: string | null | undefined): string =>
  (value && (REPLY_LANGUAGE_BY_CODE[value] ?? value)) || 'Deutsch';

export type AppTab = 'chat' | 'characters' | 'lorebooks' | 'stage' | 'companion' | 'settings' | 'hub' | 'integrations';

interface AppStoreState {
  // Navigation
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  hubSubTab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes';
  setHubSubTab: (tab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes') => void;
  openSoulHubTab: (tab: 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes') => void;

  // Paths & Lifecycle
  appPaths: AppPaths | null;
  scannedModels: ScannedModel[];
  scannedVrms: ScannedVrm[];
  activeVrmPath: string | null;
  setActiveVrmPath: (path: string | null) => void;
  scannedLive2ds: ScannedLive2d[];
  activeLive2dPath: string | null;
  setActiveLive2dPath: (path: string | null) => void;
  refreshLive2dModels: () => Promise<void>;
  avatarMode: '3d' | 'live2d' | '2d';
  setAvatarMode: (mode: '3d' | 'live2d' | '2d') => void;
  currentEmotion: EmotionResult;
  setCurrentEmotion: (em: EmotionResult) => void;
  initApp: () => Promise<void>;
  saveCurrentSettings: () => Promise<void>;

  // Hardware
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

  // Server
  serverStatus: ServerStatus;
  serverConfig: LlamaServerConfig;
  setServerConfig: (config: Partial<LlamaServerConfig>) => void;
  selectLocalModel: (path: string) => void;
  fetchServerStatus: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;

  // Characters & Lorebooks (Phase 3, 8 & 12)
  activeCharacter: CharacterProfile | null;
  availableCharacters: CharacterProfile[];
  activeLorebooks: Lorebook[];
  allLorebooks: Lorebook[];
  activeLorebook: Lorebook | null;
  currentTension: number;
  globalLorebookIds: string[];
  sceneTensionEnabled: boolean;
  setCurrentTension: (val: number) => void;
  adjustTension: (delta: number) => void;
  resetTension: () => void;
  setSceneTensionEnabled: (enabled: boolean) => void;
  refreshLorebooks: () => Promise<void>;
  selectLorebook: (lb: Lorebook | null) => void;
  saveLorebook: (lb: Lorebook) => Promise<string>;
  deleteLorebook: (filePath: string) => Promise<void>;
  importLorebook: (sourcePath: string) => Promise<Lorebook>;
  exportLorebook: (lb: Lorebook, targetPath: string) => Promise<void>;
  toggleGlobalLorebook: (lorebookId: string) => Promise<void>;
  bindLorebookToCharacter: (charId: string, lorebookId: string, bound: boolean) => Promise<void>;
  stateVariables: StateVariable[];
  selectCharacter: (character: CharacterProfile) => Promise<void>;
  refreshCharacters: () => Promise<void>;
  loadPresetCharacters: () => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
  restoreHiddenCharacters: () => Promise<void>;
  updateStateVariable: (name: string, value: string) => void;

  // Personas
  personas: UserPersona[];
  activePersona: UserPersona;
  selectPersona: (persona: UserPersona) => void;
  savePersona: (persona: UserPersona) => Promise<void>;
  deletePersona: (personaId: string) => Promise<void>;

  // Settings & Sampler
  sampling: SamplingParams;
  setSampling: (sampling: Partial<SamplingParams>) => void;
  replyLanguage: string;
  setReplyLanguage: (lang: string) => void;
  lorebookScanDepth: number;
  setLorebookScanDepth: (depth: number) => void;

  // Cognitive Soul Memory (Phase 5 & 11)
  cognitiveOverview: CognitiveOverview | null;
  isMemoryLoading: boolean;
  isReflecting: boolean;
  lastReflectionResult: SoulMemoryPipelineResult | null;
  characterMarkdown: string;
  userMarkdown: string;
  memoryBackups: MemoryBackupInfo[];
  isLoadingBackups: boolean;
  autoReflectionEnabled: boolean;
  autoReflectionThreshold: number;
  setAutoReflectionEnabled: (enabled: boolean) => void;
  setAutoReflectionThreshold: (count: number) => void;
  fetchCognitiveOverview: (charId?: string, userName?: string) => Promise<void>;
  updatePsychology: (psych: PsychologyState) => Promise<void>;
  updateRelationship: (rel: RelationshipState) => Promise<void>;
  addManualMemory: (category: string, content: string, significance: number) => Promise<void>;
  addManualDiary: (title: string, entryText: string, mood: string) => Promise<void>;
  triggerEmotionalDecay: () => Promise<void>;
  triggerMemoryPipeline: (recentTurns?: number) => Promise<SoulMemoryPipelineResult | null>;
  fetchMemoryMarkdown: () => Promise<{ charMd: string; userMd: string }>;
  saveCharacterMarkdown: (markdown: string) => Promise<void>;
  saveUserMarkdown: (markdown: string) => Promise<void>;
  generateManualDiary: () => Promise<DiaryEntry | null>;
  fetchMemoryBackups: () => Promise<void>;
  createMemoryBackup: () => Promise<MemoryBackupInfo | null>;
  restoreMemoryBackup: (backupFilePath: string) => Promise<void>;
  importSowFolder: (folderPath: string) => Promise<number>;

  // Soul Stage Tabletop RPG & Game Master (Phase 6 & 15)
  stageState: StageState | null;
  stageScenes: ScenePreview[];
  stageFolders: string[];
  selectedStageFolder: string;
  lastDiceRoll: DiceRollResult | null;
  isRollingDice: boolean;
  isProcessingStageTurn: boolean;
  stageTurnMode: 'say' | 'do' | 'think' | 'whisper' | 'direct';
  stageWhisperTarget: string;
  stageForceActor: string;
  fetchStageState: () => Promise<void>;
  fetchStageScenes: () => Promise<void>;
  fetchStageFolders: () => Promise<void>;
  setSelectedStageFolder: (folder: string) => void;
  createStageFolder: (folderName: string) => Promise<void>;
  moveStageSceneToFolder: (sceneId: string, targetFolder: string) => Promise<void>;
  deleteStageFolder: (folderName: string) => Promise<void>;
  importStageSceneJson: (jsonContent: string, targetFolder?: string) => Promise<SceneState | null>;
  exportStageSceneJson: (sceneId: string) => Promise<string | null>;
  resetStageScene: (sceneId: string) => Promise<SceneState | null>;
  editStageTurnMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteStageTurnMessage: (messageId: string) => Promise<void>;
  regenerateStageTurn: () => Promise<void>;
  loadStageScene: (sceneId: string) => Promise<void>;
  saveStageScene: (state: SceneState) => Promise<void>;
  createStageScene: (definition: SceneDefinition) => Promise<SceneState | null>;
  deleteStageScene: (sceneId: string) => Promise<void>;
  exportStageMarkdown: (sceneId: string) => Promise<string | null>;
  runStageTurn: (userInput: string, turnMode?: string, whisperTarget?: string, forceActor?: string) => Promise<void>;
  undoStageTurn: () => Promise<void>;
  restStageParty: (restType: 'short' | 'long') => Promise<void>;
  consumeStageInventoryItem: (itemId: string) => Promise<void>;
  delayEncounterTurn: () => Promise<void>;
  setStageTurnMode: (mode: 'say' | 'do' | 'think' | 'whisper' | 'direct') => void;
  setStageWhisperTarget: (target: string) => void;
  setStageForceActor: (actor: string) => void;
  rollDice: (formula: string, targetDc?: number) => Promise<DiceRollResult | null>;
  updateWorldState: (world: WorldState) => Promise<void>;
  setClockProgress: (clockId: string, progress: number) => Promise<void>;
  addClock: (clock: CampaignClock) => Promise<void>;
  deleteClock: (clockId: string) => Promise<void>;
  startEncounter: () => Promise<void>;
  endEncounter: () => Promise<void>;
  nextEncounterTurn: () => Promise<void>;
  applyCombatantDelta: (combatantId: string, hpDelta: number, stressDelta: number) => Promise<void>;
  addCombatantCondition: (combatantId: string, condition: CombatCondition) => Promise<void>;

  // Soul Companion, Goals, Scratchpad, MCP & Desktop Agent (Phase 7 & 16)
  companionState: CompanionState | null;
  fetchCompanionState: () => Promise<void>;
  applyHormoneInteraction: (interactionType: string) => Promise<void>;
  setHormones: (dopamine: number, cortisol: number, oxytocin: number, fatigue: number) => Promise<void>;
  requestToolCall: (toolName: string, args: Record<string, any>) => Promise<ToolCallRequest | null>;
  resolveToolCall: (callId: string, approved: boolean) => Promise<ToolExecutionResult | null>;
  updateCompanionSettings: (settings: CompanionSettings) => Promise<void>;
  addCompanionThought: (thought: string) => Promise<void>;
  clearCompanionThoughts: () => Promise<void>;
  addCompanionGoal: (summary: string, dueMinutes: number) => Promise<Goal | null>;
  markCompanionGoalCompleted: (goalId: string) => Promise<void>;
  deleteCompanionGoal: (goalId: string) => Promise<void>;
  environmentSnapshot: EnvironmentSnapshot | null;
  fetchEnvironmentSnapshot: () => Promise<void>;
  mcpServers: McpServerConfig[];
  fetchMcpServers: () => Promise<void>;
  toggleMcpServer: (serverId: string, enabled: boolean) => Promise<void>;
  saveMcpServers: (servers: McpServerConfig[]) => Promise<void>;
  companionPlugins: CompanionPlugin[];
  fetchCompanionPlugins: () => Promise<void>;
  saveCompanionPlugin: (plugin: CompanionPlugin) => Promise<void>;
  executeCompanionPlugin: (pluginId: string, args: Record<string, any>) => Promise<string | null>;
  toggleCompanionOverlay: (enable: boolean, clickThrough?: boolean) => Promise<boolean>;
  detectDesktopWindow: () => Promise<string>;

  // Chat & LLM
  selectedBackend: 'local' | 'cloud';
  setSelectedBackend: (backend: 'local' | 'cloud') => void;
  cloudEndpoint: string;
  setCloudEndpoint: (url: string) => void;
  cloudApiKey: string;
  setCloudApiKey: (key: string) => void;
  cloudModel: string;
  setCloudModel: (model: string) => void;

  // Phase 10: LLM Provider, Presets & Models Hub
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
  downloadGgufModel: (downloadUrl: string, filename: string) => Promise<void>;

  messages: ChatMessage[];
  streamingText: string;
  streamingThought: string;
  isGenerating: boolean;
  sendMessage: (content: string) => Promise<void>;
  abortGeneration: () => Promise<void>;
  clearChat: () => void;

  // Phase 9: Vollwertiger Chat, Swipes & Presets
  activeChatId: string | null;
  chatSessions: ChatSession[];
  storedMessages: StoredChatMessage[];
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (open: boolean) => void;
  activeHudPresetId: string;
  applyHudPreset: (presetId: string) => void;
  loadChatSessions: (charId: string) => Promise<void>;
  switchChatSession: (chatId: string) => Promise<void>;
  createNewChat: (title?: string) => Promise<ChatSession | null>;
  renameChatSession: (chatId: string, title: string) => Promise<void>;
  deleteChatSession: (chatId: string) => Promise<void>;
  updateAuthorNote: (authorNote: string, depth: number) => Promise<void>;
  switchMessageSwipe: (msgId: string, swipeIndex: number) => Promise<void>;
  regenerateMessageSwipe: (msgId: string) => Promise<void>;
  editChatMessage: (msgId: string, newContent: string) => Promise<void>;
  deleteChatMessage: (msgId: string) => Promise<void>;
  continueChatMessage: (msgId: string) => Promise<void>;
  exportCurrentChat: () => Promise<string | null>;
  importChatJsonl: (jsonlContent: string, title?: string) => Promise<void>;

  // Phase 13: Voice
  autoTtsEnabled: boolean;
  setAutoTtsEnabled: (enabled: boolean) => void;
  activeVoiceConfig: VoiceConfig | null;
  loadVoiceConfigForCharacter: (charId: string) => Promise<void>;
  saveVoiceConfigForCharacter: (charId: string, config: VoiceConfig) => Promise<void>;

  // Phase 17: Ecosystem, Backups, Image Gen, Discord & Web Client
  backups: BackupEntryInfo[];
  fetchBackups: () => Promise<void>;
  createBackup: (selection: BackupGroupSelection, description?: string) => Promise<BackupEntryInfo | null>;
  restoreBackup: (filename: string, groups?: BackupGroupSelection) => Promise<string | null>;
  deleteBackup: (filename: string) => Promise<boolean>;

  imageGenConfig: ImageGenConfig | null;
  generatedImages: GeneratedImageInfo[];
  fetchImageGenConfig: () => Promise<void>;
  saveImageGenConfig: (config: ImageGenConfig) => Promise<void>;
  buildCharacterImagePrompt: (
    characterName: string,
    characterDescription?: string | null,
    emotion?: string | null,
    sceneContext?: string | null,
    userPrompt?: string | null
  ) => Promise<string>;
  generateImageAction: (prompt: string, negative?: string | null, customConfig?: ImageGenConfig | null) => Promise<GeneratedImageResult | null>;
  fetchGeneratedImages: () => Promise<void>;

  discordRpcEnabled: boolean;
  discordBotConfig: DiscordBotConfig | null;
  discordBotStatus: DiscordBotStatus | null;
  setDiscordRpcEnabled: (enabled: boolean) => Promise<void>;
  fetchDiscordStatus: () => Promise<void>;
  saveDiscordBotConfig: (config: DiscordBotConfig) => Promise<void>;
  startDiscordBot: () => Promise<void>;
  stopDiscordBot: () => Promise<void>;

  webServerConfig: WebServerConfig | null;
  webServerStatus: WebServerStatus | null;
  fetchWebServerStatus: () => Promise<void>;
  saveWebServerConfig: (config: WebServerConfig) => Promise<void>;
  startWebServer: () => Promise<void>;
  stopWebServer: () => Promise<void>;
  regenerateWebServerToken: () => Promise<string | null>;

  characterWizardOpen: boolean;
  setCharacterWizardOpen: (open: boolean) => void;
  createCharacterFromDraft: (draft: CharacterDraft) => Promise<CharacterProfile | null>;

  // Phase 18: i18n, Themes, Logging & Updater
  appLanguage: 'de' | 'en' | 'ru';
  setAppLanguage: (lang: 'de' | 'en' | 'ru') => void;
  theme: string;
  setTheme: (theme: string) => void;
  isLogViewerOpen: boolean;
  setIsLogViewerOpen: (open: boolean) => void;
  isUpdaterOpen: boolean;
  setIsUpdaterOpen: (open: boolean) => void;
  logs: LogEntry[];
  fetchLogs: (maxLines?: number) => Promise<void>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<string>;
  updateInfo: UpdateInfo | null;
  checkForUpdates: () => Promise<UpdateInfo | null>;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: 'chat',
  setActiveTab: (activeTab) => set({ activeTab }),
  hubSubTab: 'soul_gateway',
  setHubSubTab: (hubSubTab) => set({ hubSubTab }),
  openSoulHubTab: (hubSubTab) => set({ activeTab: 'hub', hubSubTab }),

  appPaths: null,
  scannedModels: [],
  scannedVrms: [],
  activeVrmPath: null,
  setActiveVrmPath: (activeVrmPath) => {
    set({ activeVrmPath });
    get().saveCurrentSettings();
  },

  scannedLive2ds: [],
  activeLive2dPath: null,
  setActiveLive2dPath: (activeLive2dPath) => {
    set({ activeLive2dPath });
    get().saveCurrentSettings();
  },
  refreshLive2dModels: async () => {
    try {
      const models = await api.scanLive2dModels();
      set({ scannedLive2ds: models });
      const firstModel = models[0];
      if (!get().activeLive2dPath && firstModel) {
        set({ activeLive2dPath: firstModel.model_path });
      }
    } catch (e) {
      console.error('Failed to scan Live2D models:', e);
    }
  },

  avatarMode: '3d',
  setAvatarMode: (mode) => {
    set({ avatarMode: mode });
    get().saveCurrentSettings();
  },

  currentEmotion: {
    emotion: 'neutral',
    vrm_expression: 'relaxed',
    live2d_expression: 'neutral_animation',
    confidence: 1.0,
    intensity: 0.5,
  },
  setCurrentEmotion: (currentEmotion) => set({ currentEmotion }),

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

  selectLocalModel: (path) => {
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
    get().saveCurrentSettings();
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

  // Personas
  personas: [
    {
      id: 'default_user',
      name: 'User',
      description: 'Ein wissbegieriger Abenteurer und Gesprächspartner.',
    },
  ],
  activePersona: {
    id: 'default_user',
    name: 'User',
    description: 'Ein wissbegieriger Abenteurer und Gesprächspartner.',
  },

  selectPersona: (persona) => {
    set({ activePersona: persona });
    get().saveCurrentSettings();
  },

  savePersona: async (persona) => {
    try {
      const updated = await api.savePersona(persona);
      set({ personas: updated });
      if (get().activePersona.id === persona.id) {
        set({ activePersona: persona });
      }
    } catch (e) {
      console.error('Failed to save persona:', e);
    }
  },

  deletePersona: async (personaId) => {
    try {
      const updated = await api.deletePersona(personaId);
      set({ personas: updated });
      if (get().activePersona.id === personaId) {
        set({ activePersona: updated[0] });
      }
    } catch (e) {
      console.error('Failed to delete persona:', e);
    }
  },

  // Sampler & Settings
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

  replyLanguage: 'Deutsch',
  setReplyLanguage: (replyLanguage) => {
    set({ replyLanguage });
    get().saveCurrentSettings();
  },

  lorebookScanDepth: 5,
  setLorebookScanDepth: (lorebookScanDepth) => {
    set({ lorebookScanDepth });
    get().saveCurrentSettings();
  },

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
        cloudModel: settings.cloud_model || 'anthropic/claude-3.5-sonnet',
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
      });

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', settings.theme || 'obsidian');
        document.documentElement.lang = settings.app_language || 'de';
      }

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
      };
      await api.saveSettings(settings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  // Cognitive Soul Memory (Phase 5 & 11)
  cognitiveOverview: null,
  isMemoryLoading: false,
  isReflecting: false,
  lastReflectionResult: null,
  characterMarkdown: '',
  userMarkdown: '',
  memoryBackups: [],
  isLoadingBackups: false,
  autoReflectionEnabled: true,
  autoReflectionThreshold: 5,

  setAutoReflectionEnabled: (enabled) => set({ autoReflectionEnabled: enabled }),
  setAutoReflectionThreshold: (count) => set({ autoReflectionThreshold: count }),

  fetchCognitiveOverview: async (charId, userName) => {
    const activeChar = get().activeCharacter;
    const cid = charId || activeChar?.id;
    const uid = userName || get().activePersona.name;

    if (!cid) return;

    set({ isMemoryLoading: true });
    try {
      const overview = await api.getCognitiveOverview(cid, uid);
      set({ cognitiveOverview: overview, isMemoryLoading: false });
    } catch (e) {
      console.error('Failed to fetch cognitive overview:', e);
      set({ isMemoryLoading: false });
    }
  },

  updatePsychology: async (psych) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.updatePsychology(cid, psych);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update psychology:', e);
    }
  },

  updateRelationship: async (rel) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.updateRelationship(cid, rel);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update relationship:', e);
    }
  },

  addManualMemory: async (category, content, significance) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.addEpisodicMemory(cid, category, content, significance);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add episodic memory:', e);
    }
  },

  addManualDiary: async (title, entryText, mood) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.addDiaryEntry(cid, title, entryText, mood);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add diary entry:', e);
    }
  },

  triggerEmotionalDecay: async () => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      const log = await api.applyEmotionalDecay(cid);
      if (log) {
        console.info('Emotional decay tick applied:', log);
      }
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to apply emotional decay:', e);
    }
  },

  triggerMemoryPipeline: async (recentTurns) => {
    const {
      activeCharacter,
      activePersona,
      activeChatId,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
    } = get();

    if (!activeCharacter) return null;
    const cid = activeCharacter.id;
    const userName = activePersona.name;

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    set({ isReflecting: true });
    try {
      const res = await api.triggerMemoryPipeline({
        character_id: cid,
        user_name: userName,
        chat_id: activeChatId || undefined,
        endpoint_url: endpoint,
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        recent_turn_count: recentTurns || 8,
        include_diary: true,
      });

      set({
        isReflecting: false,
        lastReflectionResult: res,
      });

      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
      return res;
    } catch (e) {
      console.error('Memory pipeline error:', e);
      set({ isReflecting: false });
      return null;
    }
  },

  fetchMemoryMarkdown: async () => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return { charMd: '', userMd: '' };

    try {
      const charMd = await api.getCharacterMemoryMarkdown(cid);
      const userMd = await api.getUserMemoryMarkdown(cid, userName);
      set({ characterMarkdown: charMd, userMarkdown: userMd });
      return { charMd, userMd };
    } catch (e) {
      console.error('Failed to fetch memory markdown:', e);
      return { charMd: '', userMd: '' };
    }
  },

  saveCharacterMarkdown: async (markdown: string) => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    try {
      await api.saveCharacterMemoryMarkdown(cid, markdown);
      set({ characterMarkdown: markdown });
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to save character markdown:', e);
      throw e;
    }
  },

  saveUserMarkdown: async (markdown: string) => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return;
    try {
      await api.saveUserMemoryMarkdown(cid, userName, markdown);
      set({ userMarkdown: markdown });
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to save user markdown:', e);
      throw e;
    }
  },

  generateManualDiary: async () => {
    const {
      activeCharacter,
      activePersona,
      activeChatId,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
    } = get();

    if (!activeCharacter) return null;
    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const entry = await api.generateManualDiaryEntry({
        character_id: activeCharacter.id,
        user_name: activePersona.name,
        chat_id: activeChatId || undefined,
        endpoint_url: endpoint,
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
      });
      await get().fetchCognitiveOverview();
      return entry;
    } catch (e) {
      console.error('Failed to generate diary entry:', e);
      return null;
    }
  },

  fetchMemoryBackups: async () => {
    const cid = get().activeCharacter?.id;
    if (!cid) return;
    set({ isLoadingBackups: true });
    try {
      const backups = await api.listMemoryBackups(cid);
      set({ memoryBackups: backups, isLoadingBackups: false });
    } catch (e) {
      console.error('Failed to fetch memory backups:', e);
      set({ isLoadingBackups: false });
    }
  },

  createMemoryBackup: async () => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return null;
    try {
      const info = await api.backupMemoryState(cid, userName);
      await get().fetchMemoryBackups();
      return info;
    } catch (e) {
      console.error('Failed to create memory backup:', e);
      return null;
    }
  },

  restoreMemoryBackup: async (backupFilePath: string) => {
    try {
      await api.restoreMemoryBackup(backupFilePath);
      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
    } catch (e) {
      console.error('Failed to restore memory backup:', e);
      throw e;
    }
  },

  importSowFolder: async (folderPath: string) => {
    const cid = get().activeCharacter?.id;
    const userName = get().activePersona.name;
    if (!cid) return 0;
    try {
      const count = await api.importSowMemoryFiles(cid, folderPath, userName);
      await get().fetchCognitiveOverview();
      await get().fetchMemoryMarkdown();
      await get().fetchMemoryBackups();
      return count;
    } catch (e) {
      console.error('Failed to import SoW folder:', e);
      throw e;
    }
  },

  // Soul Stage (Phase 6 & 15)
  stageState: null,
  stageScenes: [],
  stageFolders: ['Alle', 'No Game No Life', 'Sakura Succubus 3', 'Eigene Szenen'],
  selectedStageFolder: 'Alle',
  lastDiceRoll: null,
  isRollingDice: false,
  isProcessingStageTurn: false,
  stageTurnMode: 'say',
  stageWhisperTarget: '',
  stageForceActor: '',

  setSelectedStageFolder: (folder: string) => set({ selectedStageFolder: folder }),

  fetchStageFolders: async () => {
    try {
      const folders = await api.listStageFolders();
      set({ stageFolders: folders });
    } catch (e) {
      console.error('Failed to fetch stage folders:', e);
    }
  },

  createStageFolder: async (folderName: string) => {
    try {
      await api.createStageFolder(folderName);
      await get().fetchStageFolders();
    } catch (e) {
      console.error('Failed to create stage folder:', e);
      throw e;
    }
  },

  moveStageSceneToFolder: async (sceneId: string, targetFolder: string) => {
    try {
      const updated = await api.moveStageSceneToFolder(sceneId, targetFolder);
      set({ stageState: updated });
      await get().fetchStageScenes();
      await get().fetchStageFolders();
    } catch (e) {
      console.error('Failed to move scene to folder:', e);
      throw e;
    }
  },

  deleteStageFolder: async (folderName: string) => {
    try {
      await api.deleteStageFolder(folderName);
      await get().fetchStageFolders();
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to delete stage folder:', e);
      throw e;
    }
  },

  importStageSceneJson: async (jsonContent: string, targetFolder?: string) => {
    try {
      const imported = await api.importStageSceneJson(jsonContent, targetFolder);
      set({ stageState: imported });
      await get().fetchStageScenes();
      await get().fetchStageFolders();
      return imported;
    } catch (e) {
      console.error('Failed to import stage scene JSON:', e);
      throw e;
    }
  },

  exportStageSceneJson: async (sceneId: string) => {
    try {
      return await api.exportStageSceneJson(sceneId);
    } catch (e) {
      console.error('Failed to export stage scene JSON:', e);
      return null;
    }
  },

  resetStageScene: async (sceneId: string) => {
    try {
      const fresh = await api.resetStageScene(sceneId);
      set({ stageState: fresh });
      await get().fetchStageScenes();
      return fresh;
    } catch (e) {
      console.error('Failed to reset stage scene:', e);
      return null;
    }
  },

  editStageTurnMessage: async (messageId: string, newContent: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.editStageTurnMessage(current.definition.id, messageId, newContent);
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to edit stage turn message:', e);
      throw e;
    }
  },

  deleteStageTurnMessage: async (messageId: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.deleteStageTurnMessage(current.definition.id, messageId);
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to delete stage turn message:', e);
      throw e;
    }
  },

  regenerateStageTurn: async () => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const updated = await api.regenerateStageTurn(current.definition.id);
      set({ stageState: updated, isProcessingStageTurn: false });
    } catch (e) {
      console.error('Failed to regenerate stage turn:', e);
      set({ isProcessingStageTurn: false });
      throw e;
    }
  },

  fetchStageState: async () => {
    try {
      const state = await api.getStageState();
      set({ stageState: state });
    } catch (e) {
      console.error('Failed to fetch stage state:', e);
    }
  },

  fetchStageScenes: async () => {
    try {
      const scenes = await api.listStageScenes();
      set({ stageScenes: scenes });
    } catch (e) {
      console.error('Failed to fetch stage scenes:', e);
    }
  },

  loadStageScene: async (sceneId: string) => {
    try {
      const sceneState = await api.loadStageScene(sceneId);
      set({ stageState: sceneState });
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to load stage scene:', e);
      throw e;
    }
  },

  saveStageScene: async (sceneState: SceneState) => {
    try {
      await api.saveStageScene(sceneState);
      set({ stageState: sceneState });
    } catch (e) {
      console.error('Failed to save stage scene:', e);
    }
  },

  createStageScene: async (definition: SceneDefinition) => {
    try {
      const sceneState = await api.createStageScene(definition);
      set({ stageState: sceneState });
      await get().fetchStageScenes();
      return sceneState;
    } catch (e) {
      console.error('Failed to create stage scene:', e);
      return null;
    }
  },

  deleteStageScene: async (sceneId: string) => {
    try {
      await api.deleteStageScene(sceneId);
      await get().fetchStageScenes();
    } catch (e) {
      console.error('Failed to delete stage scene:', e);
    }
  },

  exportStageMarkdown: async (sceneId: string) => {
    try {
      return await api.exportStageMarkdown(sceneId);
    } catch (e) {
      console.error('Failed to export stage markdown:', e);
      return null;
    }
  },

  runStageTurn: async (userInput: string, turnMode?: string, whisperTarget?: string, forceActor?: string) => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const mode = (turnMode || get().stageTurnMode) as any;
      const target = whisperTarget !== undefined ? whisperTarget : (get().stageWhisperTarget || undefined);
      const actor = forceActor !== undefined ? forceActor : (get().stageForceActor || undefined);
      const req: StageTurnRequest = {
        scene_id: current.definition.id,
        user_input: userInput,
        turn_mode: mode,
        whisper_target: target || undefined,
        force_next_actor: actor || undefined,
      };
      const updated = await api.runStageTurn(req);
      set({ stageState: updated, isProcessingStageTurn: false });
    } catch (e) {
      console.error('Failed to run stage turn:', e);
      set({ isProcessingStageTurn: false });
      throw e;
    }
  },

  undoStageTurn: async () => {
    const current = get().stageState;
    if (!current) return;
    try {
      const rolledBack = await api.undoStageTurn(current.definition.id);
      set({ stageState: rolledBack });
    } catch (e) {
      console.error('Failed to undo stage turn:', e);
    }
  },

  restStageParty: async (restType: 'short' | 'long') => {
    const current = get().stageState;
    if (!current) return;
    set({ isProcessingStageTurn: true });
    try {
      const rested = await api.restStageParty(current.definition.id, restType);
      set({ stageState: rested, isProcessingStageTurn: false });
      soundFx.playDiceRoll();
    } catch (e) {
      console.error('Failed to rest party:', e);
      set({ isProcessingStageTurn: false });
    }
  },

  consumeStageInventoryItem: async (itemId: string) => {
    const current = get().stageState;
    if (!current) return;
    try {
      const updated = await api.useStageInventoryItem(current.definition.id, itemId);
      set({ stageState: updated });
      soundFx.playHealChime();
    } catch (e) {
      console.error('Failed to use inventory item:', e);
    }
  },

  delayEncounterTurn: async () => {
    try {
      const updated = await api.delayEncounterTurn();
      set({ stageState: updated });
    } catch (e) {
      console.error('Failed to delay encounter turn:', e);
    }
  },

  setStageTurnMode: (mode) => set({ stageTurnMode: mode }),
  setStageWhisperTarget: (target) => set({ stageWhisperTarget: target }),
  setStageForceActor: (actor) => set({ stageForceActor: actor }),

  rollDice: async (formula, targetDc) => {
    set({ isRollingDice: true });
    soundFx.playDiceRoll();
    try {
      const res = await api.rollStageDice(formula, targetDc);
      set({ lastDiceRoll: res, isRollingDice: false });
      if (res.is_critical_success) {
        soundFx.playCriticalSuccess();
      } else if (res.is_critical_failure) {
        soundFx.playCriticalFailure();
      }
      return res;
    } catch (e) {
      console.error('Failed to roll dice:', e);
      set({ isRollingDice: false });
      return null;
    }
  },

  updateWorldState: async (world) => {
    try {
      await api.updateWorldState(world);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to update world state:', e);
    }
  },

  setClockProgress: async (clockId, progress) => {
    try {
      await api.setClockProgress(clockId, progress);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to set clock progress:', e);
    }
  },

  addClock: async (clock) => {
    try {
      await api.addClock(clock);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add clock:', e);
    }
  },

  deleteClock: async (clockId) => {
    try {
      await api.deleteClock(clockId);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to delete clock:', e);
    }
  },

  startEncounter: async () => {
    try {
      await api.startEncounter();
      soundFx.playAttackHit();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to start encounter:', e);
    }
  },

  endEncounter: async () => {
    try {
      await api.endEncounter();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to end encounter:', e);
    }
  },

  nextEncounterTurn: async () => {
    try {
      await api.nextEncounterTurn();
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to advance encounter turn:', e);
    }
  },

  applyCombatantDelta: async (combatantId, hpDelta, stressDelta) => {
    try {
      await api.applyCombatantDelta(combatantId, hpDelta, stressDelta);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to apply combatant delta:', e);
    }
  },

  addCombatantCondition: async (combatantId, condition) => {
    try {
      await api.addCombatantCondition(combatantId, condition);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add combatant condition:', e);
    }
  },

  // Soul Companion (Phase 7)
  companionState: null,

  fetchCompanionState: async () => {
    try {
      const state = await api.getCompanionState();
      set({ companionState: state });
    } catch (e) {
      console.error('Failed to fetch companion state:', e);
    }
  },

  applyHormoneInteraction: async (interactionType) => {
    try {
      const updatedHormones = await api.applyHormoneInteraction(interactionType);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones: updatedHormones }
          : null,
      }));
    } catch (e) {
      console.error('Failed to apply hormone interaction:', e);
    }
  },

  setHormones: async (dopamine, cortisol, oxytocin, fatigue) => {
    try {
      const updatedHormones = await api.setHormones(dopamine, cortisol, oxytocin, fatigue);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones: updatedHormones }
          : null,
      }));
    } catch (e) {
      console.error('Failed to set hormones directly:', e);
    }
  },

  requestToolCall: async (toolName, args) => {
    try {
      const req = await api.requestToolCall(toolName, args);
      await get().fetchCompanionState();
      return req;
    } catch (e) {
      console.error('Failed to request tool call:', e);
      return null;
    }
  },

  resolveToolCall: async (callId, approved) => {
    try {
      const res = await api.resolveToolCall(callId, approved);
      await get().fetchCompanionState();
      return res;
    } catch (e) {
      console.error('Failed to resolve tool call:', e);
      return null;
    }
  },

  updateCompanionSettings: async (settings) => {
    try {
      await api.updateCompanionSettings(settings);
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to update companion settings:', e);
    }
  },

  addCompanionThought: async (thought) => {
    try {
      await api.addCompanionThought(thought);
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to add companion thought:', e);
    }
  },

  clearCompanionThoughts: async () => {
    try {
      await api.clearCompanionThoughts();
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to clear companion thoughts:', e);
    }
  },

  addCompanionGoal: async (summary, dueMinutes) => {
    try {
      const goal = await api.addCompanionGoal(summary, dueMinutes);
      await get().fetchCompanionState();
      return goal;
    } catch (e) {
      console.error('Failed to add companion goal:', e);
      return null;
    }
  },

  markCompanionGoalCompleted: async (goalId) => {
    try {
      await api.markCompanionGoalCompleted(goalId);
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to mark goal completed:', e);
    }
  },

  deleteCompanionGoal: async (goalId) => {
    try {
      await api.deleteCompanionGoal(goalId);
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to delete companion goal:', e);
    }
  },

  environmentSnapshot: null,
  fetchEnvironmentSnapshot: async () => {
    try {
      const snap = await api.getCompanionEnvironmentSnapshot();
      set({ environmentSnapshot: snap });
    } catch (e) {
      console.error('Failed to fetch environment snapshot:', e);
    }
  },

  mcpServers: [],
  fetchMcpServers: async () => {
    try {
      const servers = await api.listMcpServers();
      set({ mcpServers: servers });
    } catch (e) {
      console.error('Failed to fetch MCP servers:', e);
    }
  },

  toggleMcpServer: async (serverId, enabled) => {
    try {
      const updated = await api.toggleMcpServer(serverId, enabled);
      set({ mcpServers: updated });
    } catch (e) {
      console.error('Failed to toggle MCP server:', e);
    }
  },

  saveMcpServers: async (servers) => {
    try {
      await api.saveMcpServers(servers);
      set({ mcpServers: servers });
    } catch (e) {
      console.error('Failed to save MCP servers:', e);
    }
  },

  companionPlugins: [],
  fetchCompanionPlugins: async () => {
    try {
      const plugins = await api.listCompanionPlugins();
      set({ companionPlugins: plugins });
    } catch (e) {
      console.error('Failed to fetch companion plugins:', e);
    }
  },

  saveCompanionPlugin: async (plugin) => {
    try {
      await api.saveCompanionPlugin(plugin);
      await get().fetchCompanionPlugins();
    } catch (e) {
      console.error('Failed to save companion plugin:', e);
    }
  },

  executeCompanionPlugin: async (pluginId, args) => {
    try {
      return await api.executeCompanionPlugin(pluginId, args);
    } catch (e) {
      console.error('Failed to execute companion plugin:', e);
      return null;
    }
  },

  toggleCompanionOverlay: async (enable, clickThrough = false) => {
    try {
      const res = await api.toggleCompanionOverlay(enable, clickThrough);
      await get().fetchCompanionState();
      return res;
    } catch (e) {
      console.error('Failed to toggle companion overlay:', e);
      return false;
    }
  },

  detectDesktopWindow: async () => {
    try {
      const title = await api.detectDesktopWindow();
      await get().fetchCompanionState();
      return title;
    } catch (e) {
      console.error('Failed to detect desktop window:', e);
      return '';
    }
  },

  // Characters & Lorebooks (Phase 3, 8 & 12)
  activeCharacter: null,
  availableCharacters: [],
  activeLorebooks: [],
  allLorebooks: [],
  activeLorebook: null,
  currentTension: 0,
  globalLorebookIds: [],
  sceneTensionEnabled: true,

  setCurrentTension: (currentTension) =>
    set({ currentTension: Math.min(100, Math.max(0, currentTension)) }),
  adjustTension: (delta) =>
    set((state) => ({
      currentTension: Math.min(100, Math.max(0, state.currentTension + delta)),
    })),
  resetTension: () => set({ currentTension: 0 }),
  setSceneTensionEnabled: (sceneTensionEnabled) => {
    set({ sceneTensionEnabled });
    get().saveCurrentSettings();
  },

  refreshLorebooks: async () => {
    try {
      const books = await api.listAllLorebooks();
      set({ allLorebooks: books });
      if (!get().activeLorebook && books.length > 0) {
        set({ activeLorebook: books[0] });
      }
    } catch (e) {
      console.error('Failed to list lorebooks:', e);
    }
  },

  selectLorebook: (lb) => set({ activeLorebook: lb }),

  saveLorebook: async (lb) => {
    try {
      const path = await api.saveLorebook(lb);
      await get().refreshLorebooks();
      const updated = get().allLorebooks.find((b) => b.file_path === path || b.id === lb.id);
      if (updated) {
        set({ activeLorebook: updated });
      }
      return path;
    } catch (e) {
      console.error('Failed to save lorebook:', e);
      throw e;
    }
  },

  deleteLorebook: async (filePath) => {
    try {
      await api.deleteLorebook(filePath);
      await get().refreshLorebooks();
      const remaining = get().allLorebooks;
      set({ activeLorebook: remaining.length > 0 ? remaining[0] : null });
    } catch (e) {
      console.error('Failed to delete lorebook:', e);
      throw e;
    }
  },

  importLorebook: async (sourcePath) => {
    try {
      const imported = await api.importLorebookFile(sourcePath);
      await get().refreshLorebooks();
      set({ activeLorebook: imported });
      return imported;
    } catch (e) {
      console.error('Failed to import lorebook:', e);
      throw e;
    }
  },

  exportLorebook: async (lb, targetPath) => {
    try {
      await api.exportLorebookFile(lb, targetPath);
    } catch (e) {
      console.error('Failed to export lorebook:', e);
      throw e;
    }
  },

  toggleGlobalLorebook: async (lorebookId) => {
    const current = get().globalLorebookIds;
    const exists = current.includes(lorebookId);
    const updated = exists ? current.filter((id) => id !== lorebookId) : [...current, lorebookId];
    set({ globalLorebookIds: updated });
    await get().saveCurrentSettings();
  },

  bindLorebookToCharacter: async (charId, lorebookId, bound) => {
    const char = get().availableCharacters.find((c) => c.id === charId);
    if (!char) return;
    const currentBound = char.bound_lorebooks || [];
    const updatedBound = bound
      ? Array.from(new Set([...currentBound, lorebookId]))
      : currentBound.filter((id) => id !== lorebookId);

    const updatedProfile: CharacterProfile = {
      ...char,
      bound_lorebooks: updatedBound,
    };
    await api.saveCharacterCard(updatedProfile);
    await get().refreshCharacters();
    if (get().activeCharacter?.id === charId) {
      set({ activeCharacter: updatedProfile });
    }
  },

  stateVariables: [
    { name: 'Affection', value: '45', var_type: 'progress', max_value: 100 },
    { name: 'Energy', value: '80', var_type: 'progress', max_value: 100 },
    { name: 'Mood', value: 'Glücklich', var_type: 'str' },
  ],

  updateStateVariable: (name, value) =>
    set((state) => ({
      stateVariables: state.stateVariables.map((v) =>
        v.name === name ? { ...v, value } : v
      ),
    })),

  selectCharacter: async (character) => {
    set({
      activeCharacter: character,
      streamingText: '',
      streamingThought: '',
    });
    get().saveCurrentSettings();
    await get().loadChatSessions(character.id);
    await get().fetchCognitiveOverview(character.id, get().activePersona.name);
    await get().loadVoiceConfigForCharacter(character.id);
  },

  refreshCharacters: async () => {
    try {
      const chars = await api.scanCharacters();
      const firstChar = chars[0];
      if (firstChar) {
        set({ availableCharacters: chars });
        if (!get().activeCharacter) {
          get().selectCharacter(firstChar);
        }
      }
    } catch (e) {
      console.error('Failed to scan characters:', e);
    }
  },

  loadPresetCharacters: async () => {
    await get().refreshCharacters();

    // Try loading default world lorebook if presets dir available
    const paths = get().appPaths;
    if (paths) {
      const candidateLorebook = `${paths.bundled_presets_dir}/sakura-succubus-3/lorebooks/sakura-succubus-3-welt.json`;
      try {
        const lore = await api.loadLorebook(candidateLorebook);
        set({ activeLorebooks: [lore] });
      } catch (e) {
        console.warn('Could not load default lorebook:', e);
      }
    }
  },

  deleteCharacter: async (charId) => {
    try {
      await api.deleteCharacter(charId);
      await get().refreshCharacters();
      if (get().activeCharacter?.id === charId) {
        const nextCharacter = get().availableCharacters[0];
        if (nextCharacter) {
          get().selectCharacter(nextCharacter);
        }
      }
    } catch (e) {
      console.error('Failed to delete character:', e);
      throw e;
    }
  },

  restoreHiddenCharacters: async () => {
    try {
      await api.restoreHiddenCharacters();
      await get().refreshCharacters();
    } catch (e) {
      console.error('Failed to restore hidden characters:', e);
      throw e;
    }
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
  cloudModel: 'anthropic/claude-3.5-sonnet',
  setCloudModel: (cloudModel) => {
    set({ cloudModel });
    get().saveCurrentSettings();
  },

  // Phase 10: LLM Provider, Presets & Models Hub
  cloudProvider: 'open_router',
  setCloudProvider: (cloudProvider) => {
    let endpoint = get().cloudEndpoint;
    let model = get().cloudModel;
    if (cloudProvider === 'anthropic') {
      endpoint = 'https://api.anthropic.com/v1/messages';
      model = 'claude-3-5-sonnet-20241022';
    } else if (cloudProvider === 'open_router') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      model = 'anthropic/claude-3.5-sonnet';
    } else if (cloudProvider === 'open_ai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      model = 'gpt-4o';
    } else if (cloudProvider === 'deep_seek') {
      endpoint = 'https://api.deepseek.com/v1/chat/completions';
      model = 'deepseek-chat';
    } else if (cloudProvider === 'local_llama') {
      endpoint = `http://127.0.0.1:${get().serverConfig.port}/v1/chat/completions`;
    }
    set({ cloudProvider, cloudEndpoint: endpoint, cloudModel: model });
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
        hfError: e instanceof Error ? e.message : String(e),
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
  downloadGgufModel: async (downloadUrl: string, filename: string) => {
    set({ hfError: null });
    try {
      const modelPath = await api.downloadGgufModel(downloadUrl, filename);
      const models = await api.scanModels();
      const isBonsai = filename.toLowerCase().includes('bonsai');
      set((state) => ({
        scannedModels: models,
        selectedBackend: 'local',
        serverConfig: {
          ...state.serverConfig,
          model_path: modelPath,
          ...(isBonsai
            ? {
                context_size: 32768,
                gpu_layers: 99,
                cache_type_k: 'q4_0',
                cache_type_v: 'q4_0',
                flash_attn: true,
                reasoning_mode: true,
              }
            : {}),
        },
        ...(isBonsai
          ? {
              sampling: {
                ...state.sampling,
                temperature: 0.7,
                top_p: 0.95,
                top_k: 20,
              },
            }
          : {}),
      }));
      await get().saveCurrentSettings();
    } catch (e) {
      console.error('Failed to download GGUF model:', e);
      set({ hfError: e instanceof Error ? e.message : String(e) });
    }
  },

  messages: [],
  streamingText: '',
  streamingThought: '',
  isGenerating: false,

  // Phase 9: Vollwertiger Chat, Swipes & Presets
  activeChatId: null,
  chatSessions: [],
  storedMessages: [],
  chatSidebarOpen: false,
  setChatSidebarOpen: (chatSidebarOpen) => set({ chatSidebarOpen }),
  activeHudPresetId: 'romance',

  applyHudPreset: (presetId: string) => {
    const preset = HUD_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      set({
        activeHudPresetId: presetId,
        stateVariables: preset.defaultVariables,
      });
    }
  },

  loadChatSessions: async (charId: string) => {
    try {
      const sessions = await api.listChatSessions(charId);
      if (sessions.length === 0) {
        const newSession = await api.createChatSession(charId, translate('chat.newChatTitle'));
        const char = get().activeCharacter;
        if (char?.card.data.first_mes) {
          await api.addChatMessage(newSession.id, 'assistant', char.card.data.first_mes);
        }
        const updatedSessions = await api.listChatSessions(charId);
        set({ chatSessions: updatedSessions });
        await get().switchChatSession(newSession.id);
      } else {
        set({ chatSessions: sessions });
        const currentActive = sessions.find((s) => s.id === get().activeChatId);
        const targetId = currentActive?.id ?? sessions[0]?.id;
        if (targetId) await get().switchChatSession(targetId);
      }
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
    }
  },

  switchChatSession: async (chatId: string) => {
    try {
      const storedMsgs = await api.getChatMessages(chatId);
      const flatMsgs: ChatMessage[] = storedMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        thought: m.thought || undefined,
      }));

      set({
        activeChatId: chatId,
        storedMessages: storedMsgs,
        messages: flatMsgs,
        streamingText: '',
        streamingThought: '',
      });
    } catch (e) {
      console.error('Failed to switch chat session:', e);
    }
  },

  createNewChat: async (title?: string) => {
    const char = get().activeCharacter;
    if (!char) return null;

    try {
      const sessionTitle = title || translate('chat.defaultSessionTitle', { n: get().chatSessions.length + 1 });
      const session = await api.createChatSession(char.id, sessionTitle);

      if (char.card.data.first_mes) {
        await api.addChatMessage(session.id, 'assistant', char.card.data.first_mes);
      }

      const sessions = await api.listChatSessions(char.id);
      set({ chatSessions: sessions });
      await get().switchChatSession(session.id);
      return session;
    } catch (e) {
      console.error('Failed to create new chat:', e);
      return null;
    }
  },

  renameChatSession: async (chatId: string, title: string) => {
    try {
      await api.renameChatSession(chatId, title);
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to rename chat session:', e);
    }
  },

  deleteChatSession: async (chatId: string) => {
    const char = get().activeCharacter;
    if (!char) return;

    try {
      await api.deleteChatSession(chatId);
      await get().loadChatSessions(char.id);
    } catch (e) {
      console.error('Failed to delete chat session:', e);
    }
  },

  updateAuthorNote: async (authorNote: string, depth: number) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      await api.updateChatAuthorNote(chatId, authorNote, depth);
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to update author note:', e);
    }
  },

  switchMessageSwipe: async (msgId: string, swipeIndex: number) => {
    try {
      const updated = await api.switchMessageSwipe(msgId, swipeIndex);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
    } catch (e) {
      console.error('Failed to switch swipe:', e);
    }
  },

  editChatMessage: async (msgId: string, newContent: string) => {
    try {
      const updated = await api.updateChatMessage(msgId, newContent);
      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updated : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
    } catch (e) {
      console.error('Failed to edit chat message:', e);
    }
  },

  deleteChatMessage: async (msgId: string) => {
    try {
      await api.deleteChatMessage(msgId);
      set((state) => {
        const stored = state.storedMessages.filter((m) => m.id !== msgId);
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
        };
      });
      const char = get().activeCharacter;
      if (char) {
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: sessions });
      }
    } catch (e) {
      console.error('Failed to delete chat message:', e);
    }
  },

  regenerateMessageSwipe: async (msgId: string) => {
    const {
      activeChatId,
      storedMessages,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      activeCharacter,
      sampling,
      chatSessions,
    } = get();

    if (!activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // Messages before this message
    const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
    const priorFlat: ChatMessage[] = priorStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const promptText = await resolvePromptWithLore(get(), priorFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: promptText };

    const payloadMessages = [systemPromptMsg, ...priorFlat];

    // Inject author note at depth if requested
    if (activeSession?.author_note && (activeSession.author_note_depth || 0) > 0) {
      const depth = activeSession.author_note_depth;
      const insertIdx = Math.max(1, payloadMessages.length - depth);
      payloadMessages.splice(insertIdx, 0, {
        role: 'system',
        content: `[Author's note: ${activeSession.author_note}]`,
      });
    }

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      });

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      const updatedMsg = await api.addMessageSwipe(
        msgId,
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );

      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
          isGenerating: false,
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Regenerate swipe error:', e);
      set({ isGenerating: false });
    }
  },

  continueChatMessage: async (msgId: string) => {
    const {
      activeChatId,
      storedMessages,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      activeCharacter,
      sampling,
    } = get();

    if (!activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    // All messages up to and including targetMsg
    const historyStored = storedMessages.filter((m) => m.order_index <= targetMsg.order_index);
    const historyFlat: ChatMessage[] = historyStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const promptText = await resolvePromptWithLore(get(), historyFlat);
    const systemPromptMsg: ChatMessage = { role: 'system', content: promptText };
    const continueInstruction: ChatMessage = {
      role: 'system',
      content: '[Anweisung: Setze deine letzte Nachricht nahtlos und flüssig fort. Wiederhole keine bereits geschriebenen Sätze!]',
    };

    const payloadMessages = [systemPromptMsg, ...historyFlat, continueInstruction];

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      });

      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      const mergedContent = `${targetMsg.content} ${cleanedText}`.trim();
      const updatedMsg = await api.updateChatMessage(
        msgId,
        mergedContent,
        targetMsg.thought
      );

      set((state) => {
        const stored = state.storedMessages.map((m) => (m.id === msgId ? updatedMsg : m));
        const flat: ChatMessage[] = stored.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          thought: m.thought || undefined,
        }));
        return {
          storedMessages: stored,
          messages: flat,
          streamingText: '',
          streamingThought: '',
          isGenerating: false,
        };
      });

      soundFx.playMessageSent();
    } catch (e) {
      console.error('Continue message error:', e);
      set({ isGenerating: false });
    }
  },

  exportCurrentChat: async () => {
    const { activeChatId, activeCharacter, activePersona } = get();
    if (!activeChatId || !activeCharacter) return null;
    try {
      return await api.exportChatJsonl(
        activeChatId,
        activeCharacter.card.data.name,
        activePersona.name
      );
    } catch (e) {
      console.error('Export failed:', e);
      return null;
    }
  },

  importChatJsonl: async (jsonlContent: string, title?: string) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const imported = await api.importChatJsonl(char.id, jsonlContent, title);
      const sessions = await api.listChatSessions(char.id);
      set({ chatSessions: sessions });
      await get().switchChatSession(imported.id);
    } catch (e) {
      console.error('Import failed:', e);
    }
  },

  sendMessage: async (content: string) => {
    let { activeChatId } = get();
    const {
      activeCharacter,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      cloudProvider,
      sampling,
      chatSessions,
    } = get();

    if (!content.trim()) return;

    // Ensure we have an active chat session
    if (!activeChatId && activeCharacter) {
      const newSess = await get().createNewChat();
      if (newSess) activeChatId = newSess.id;
    }

    if (!activeChatId) return;

    soundFx.playMessageSent();

    // 1. Add user message to DB
    const userStored = await api.addChatMessage(activeChatId, 'user', content);
    const updatedStored = [...get().storedMessages, userStored];
    const updatedFlat: ChatMessage[] = updatedStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({
      storedMessages: updatedStored,
      messages: updatedFlat,
      streamingText: '',
      streamingThought: '',
      isGenerating: true,
    });

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // 2. Build context-aware system prompt
    let systemPromptMsg: ChatMessage | null = null;
    if (activeCharacter) {
      const promptText = await resolvePromptWithLore(get(), updatedFlat, content);
      systemPromptMsg = { role: 'system', content: promptText };
    }

    const payloadMessages = systemPromptMsg
      ? [systemPromptMsg, ...updatedFlat]
      : updatedFlat;

    // 3. Inject Author's Note at depth if configured
    if (activeSession?.author_note && (activeSession.author_note_depth || 0) > 0) {
      const depth = activeSession.author_note_depth;
      const insertIdx = Math.max(1, payloadMessages.length - depth);
      payloadMessages.splice(insertIdx, 0, {
        role: 'system',
        content: `[Author's note: ${activeSession.author_note}]`,
      });
    }

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        provider: selectedBackend === 'cloud' ? cloudProvider : 'local_llama',
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          ...sampling,
        },
      });

      // 4. Parse <state> tags
      const { cleanedText, stateUpdates } = extractStateUpdates(done.full_text);
      if (stateUpdates) {
        set({ stateVariables: applyStateUpdates(get().stateVariables, stateUpdates) });
      }

      // 5. Add assistant message to DB
      const asstStored = await api.addChatMessage(
        activeChatId,
        'assistant',
        cleanedText,
        done.full_thought.trim() ? done.full_thought : null
      );

      const finalStored = [...get().storedMessages, asstStored];
      const finalFlat: ChatMessage[] = finalStored.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        thought: m.thought || undefined,
      }));

      set({
        storedMessages: finalStored,
        messages: finalFlat,
        streamingText: '',
        streamingThought: '',
        isGenerating: false,
      });

      // Refresh chat sessions to update message count badges
      if (activeCharacter?.id) {
        api.listChatSessions(activeCharacter.id).then((sessions) => {
          set({ chatSessions: sessions });
        });
      }

      // Naturally apply emotional decay tick & refresh soul overview
      if (activeCharacter?.id) {
        api.applyEmotionalDecay(activeCharacter.id)
          .then(() => get().fetchCognitiveOverview())
          .catch((err) => console.warn('Decay tick error:', err));
      }

      // Check for automatic cognitive reflection after batch
      const { autoReflectionEnabled, autoReflectionThreshold, isReflecting } = get();
      if (
        autoReflectionEnabled &&
        !isReflecting &&
        finalStored.length >= autoReflectionThreshold &&
        finalStored.length % autoReflectionThreshold === 0
      ) {
        get().triggerMemoryPipeline(autoReflectionThreshold).catch((err) => {
          console.warn('Auto-reflection error:', err);
        });
      }
    } catch (e) {
      console.error('Chat error:', e);
      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: `⚠️ Inferenz-Fehler: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        streamingText: '',
        streamingThought: '',
        isGenerating: false,
      }));
    }
  },

  abortGeneration: async () => {
    try {
      await api.abortChatGeneration();
      set({ isGenerating: false });
    } catch (e) {
      console.error('Failed to abort generation:', e);
    }
  },

  clearChat: async () => {
    const { activeChatId, activeCharacter } = get();
    if (!activeChatId) return;

    try {
      await api.deleteChatSession(activeChatId);
      if (activeCharacter) {
        await get().loadChatSessions(activeCharacter.id);
      }
    } catch (e) {
      console.error('Failed to clear chat:', e);
    }
  },

  // Phase 13: Voice
  autoTtsEnabled: false,
  setAutoTtsEnabled: (enabled) => set({ autoTtsEnabled: enabled }),
  activeVoiceConfig: null,

  loadVoiceConfigForCharacter: async (charId) => {
    try {
      const config = await api.getCharacterVoiceConfig(charId);
      set({ activeVoiceConfig: config });
    } catch (e) {
      console.error('Failed to load voice config:', e);
      set({ activeVoiceConfig: null });
    }
  },

  saveVoiceConfigForCharacter: async (charId, config) => {
    try {
      await api.saveCharacterVoiceConfig(charId, config);
      if (get().activeCharacter?.id === charId) {
        set({ activeVoiceConfig: config });
      }
    } catch (e) {
      console.error('Failed to save voice config:', e);
    }
  },

  // Phase 17: Backups
  backups: [],
  fetchBackups: async () => {
    try {
      const list = await api.listProfileBackups();
      set({ backups: list });
    } catch (e) {
      console.error('Failed to list backups:', e);
    }
  },

  createBackup: async (selection, description) => {
    try {
      const entry = await api.createProfileBackup(selection, description);
      await get().fetchBackups();
      soundFx.playSave();
      return entry;
    } catch (e) {
      console.error('Failed to create backup:', e);
      return null;
    }
  },

  restoreBackup: async (filename, groups) => {
    try {
      const msg = await api.restoreProfileBackup(filename, groups);
      await get().fetchBackups();
      await get().refreshCharacters();
      await get().refreshLorebooks();
      soundFx.playLevelUp();
      return msg;
    } catch (e) {
      console.error('Failed to restore backup:', e);
      return null;
    }
  },

  deleteBackup: async (filename) => {
    try {
      const ok = await api.deleteProfileBackup(filename);
      await get().fetchBackups();
      return ok;
    } catch (e) {
      console.error('Failed to delete backup:', e);
      return false;
    }
  },

  // Phase 17: Image Generation
  imageGenConfig: null,
  generatedImages: [],
  fetchImageGenConfig: async () => {
    try {
      const config = await api.getImageGenConfig();
      set({ imageGenConfig: config });
    } catch (e) {
      console.error('Failed to get image gen config:', e);
    }
  },

  saveImageGenConfig: async (config) => {
    try {
      await api.saveImageGenConfig(config);
      set({ imageGenConfig: config });
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save image gen config:', e);
    }
  },

  buildCharacterImagePrompt: async (charName, charDesc, emotion, sceneCtx, userPrompt) => {
    try {
      return await api.buildCharacterImagePrompt(charName, charDesc, emotion, sceneCtx, userPrompt);
    } catch (e) {
      console.error('Failed to build image prompt:', e);
      return `masterpiece, 1girl, ${charName}`;
    }
  },

  generateImageAction: async (prompt, negative, customConfig) => {
    try {
      const res = await api.generateImageAction(prompt, negative, customConfig);
      await get().fetchGeneratedImages();
      soundFx.playDiceRoll();
      return res;
    } catch (e) {
      console.error('Failed to generate image:', e);
      return null;
    }
  },

  fetchGeneratedImages: async () => {
    try {
      const list = await api.listGeneratedImages();
      set({ generatedImages: list });
    } catch (e) {
      console.error('Failed to list generated images:', e);
    }
  },

  // Phase 17: Discord RPC & Bot
  discordRpcEnabled: false,
  discordBotConfig: null,
  discordBotStatus: null,
  setDiscordRpcEnabled: async (enabled) => {
    try {
      await api.setDiscordRpcEnabled(enabled);
      set({ discordRpcEnabled: enabled });
    } catch (e) {
      console.error('Failed to set discord rpc:', e);
    }
  },

  fetchDiscordStatus: async () => {
    try {
      const [rpcEnabled, botCfg, botStat] = await Promise.all([
        api.getDiscordRpcEnabled(),
        api.getDiscordBotConfig(),
        api.getDiscordBotStatus(),
      ]);
      set({
        discordRpcEnabled: rpcEnabled,
        discordBotConfig: botCfg,
        discordBotStatus: botStat,
      });
    } catch (e) {
      console.error('Failed to fetch discord status:', e);
    }
  },

  saveDiscordBotConfig: async (config) => {
    try {
      await api.saveDiscordBotConfig(config);
      set({ discordBotConfig: config });
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save discord bot config:', e);
    }
  },

  startDiscordBot: async () => {
    try {
      await api.startDiscordBot();
      await get().fetchDiscordStatus();
      soundFx.playStart();
    } catch (e) {
      console.error('Failed to start discord bot:', e);
    }
  },

  stopDiscordBot: async () => {
    try {
      await api.stopDiscordBot();
      await get().fetchDiscordStatus();
    } catch (e) {
      console.error('Failed to stop discord bot:', e);
    }
  },

  // Phase 17: Web Server (Mobile Client)
  webServerConfig: null,
  webServerStatus: null,
  fetchWebServerStatus: async () => {
    try {
      const [cfg, stat] = await Promise.all([
        api.getWebServerConfig(),
        api.getWebServerStatus(),
      ]);
      set({ webServerConfig: cfg, webServerStatus: stat });
    } catch (e) {
      console.error('Failed to fetch web server status:', e);
    }
  },

  saveWebServerConfig: async (config) => {
    try {
      await api.saveWebServerConfig(config);
      set({ webServerConfig: config });
      await get().fetchWebServerStatus();
      soundFx.playSave();
    } catch (e) {
      console.error('Failed to save web server config:', e);
    }
  },

  startWebServer: async () => {
    try {
      await api.startWebServer();
      await get().fetchWebServerStatus();
      soundFx.playStart();
    } catch (e) {
      console.error('Failed to start web server:', e);
    }
  },

  stopWebServer: async () => {
    try {
      await api.stopWebServer();
      await get().fetchWebServerStatus();
    } catch (e) {
      console.error('Failed to stop web server:', e);
    }
  },

  regenerateWebServerToken: async () => {
    try {
      const token = await api.regenerateWebServerToken();
      await get().fetchWebServerStatus();
      return token;
    } catch (e) {
      console.error('Failed to regenerate token:', e);
      return null;
    }
  },

  // Phase 17: Character AI Assistant
  characterWizardOpen: false,
  setCharacterWizardOpen: (open) => set({ characterWizardOpen: open }),

  createCharacterFromDraft: async (draft) => {
    try {
      const profile = await api.createCharacterFromDraft(draft);
      await get().refreshCharacters();
      soundFx.playLevelUp();
      return profile;
    } catch (e) {
      console.error('Failed to create character from draft:', e);
      return null;
    }
  },

  // Phase 18: i18n, Themes, Logging & Updates
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

  isLogViewerOpen: false,
  setIsLogViewerOpen: (isLogViewerOpen) => set({ isLogViewerOpen }),

  isUpdaterOpen: false,
  setIsUpdaterOpen: (isUpdaterOpen) => set({ isUpdaterOpen }),

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
}));

