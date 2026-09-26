import { create } from 'zustand';
import { api } from '../services/api';
import {
  HardwareInfo,
  ServerStatus,
  LlamaServerConfig,
  ChatMessage,
  LayerRecommendation,
  CharacterProfile,
  Lorebook,
  StateVariable,
  CognitiveOverview,
  PsychologyState,
  RelationshipState,
  StageState,
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
} from '../types';
import { soundFx } from '../services/soundFx';
import { extractStateUpdates, applyStateUpdates } from '../utils/stateParser';
import { HUD_PRESETS } from '../constants/hudPresets';

interface AppStoreState {
  // Navigation
  activeTab: 'chat' | 'characters' | 'stage' | 'companion' | 'settings';
  setActiveTab: (tab: 'chat' | 'characters' | 'stage' | 'companion' | 'settings') => void;

  // Paths & Lifecycle
  appPaths: AppPaths | null;
  scannedModels: ScannedModel[];
  scannedVrms: ScannedVrm[];
  activeVrmPath: string | null;
  setActiveVrmPath: (path: string | null) => void;
  initApp: () => Promise<void>;
  saveCurrentSettings: () => Promise<void>;

  // Hardware
  hardware: HardwareInfo | null;
  layerRecommendation: LayerRecommendation | null;
  fetchHardware: () => Promise<void>;
  fetchLayerRecommendation: (modelSizeMb: number, totalLayers: number, contextSize: number) => Promise<void>;

  // Server
  serverStatus: ServerStatus;
  serverConfig: LlamaServerConfig;
  setServerConfig: (config: Partial<LlamaServerConfig>) => void;
  fetchServerStatus: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;

  // Characters & Lorebooks (Phase 3 & 8)
  activeCharacter: CharacterProfile | null;
  availableCharacters: CharacterProfile[];
  activeLorebooks: Lorebook[];
  stateVariables: StateVariable[];
  selectCharacter: (character: CharacterProfile) => Promise<void>;
  refreshCharacters: () => Promise<void>;
  loadPresetCharacters: () => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
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

  // Cognitive Soul Memory (Phase 5)
  cognitiveOverview: CognitiveOverview | null;
  isMemoryLoading: boolean;
  fetchCognitiveOverview: (charId?: string, userName?: string) => Promise<void>;
  updatePsychology: (psych: PsychologyState) => Promise<void>;
  updateRelationship: (rel: RelationshipState) => Promise<void>;
  addManualMemory: (category: string, content: string, significance: number) => Promise<void>;
  addManualDiary: (title: string, entryText: string, mood: string) => Promise<void>;
  triggerEmotionalDecay: () => Promise<void>;

  // Soul Stage Tabletop RPG (Phase 6)
  stageState: StageState | null;
  lastDiceRoll: DiceRollResult | null;
  isRollingDice: boolean;
  fetchStageState: () => Promise<void>;
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

  // Soul Companion & Tool Calling (Phase 7)
  companionState: CompanionState | null;
  fetchCompanionState: () => Promise<void>;
  applyHormoneInteraction: (interactionType: string) => Promise<void>;
  setHormones: (dopamine: number, cortisol: number, oxytocin: number, fatigue: number) => Promise<void>;
  requestToolCall: (toolName: string, args: Record<string, any>) => Promise<ToolCallRequest | null>;
  resolveToolCall: (callId: string, approved: boolean) => Promise<ToolExecutionResult | null>;
  updateCompanionSettings: (settings: CompanionSettings) => Promise<void>;

  // Chat & LLM
  selectedBackend: 'local' | 'cloud';
  setSelectedBackend: (backend: 'local' | 'cloud') => void;
  cloudEndpoint: string;
  setCloudEndpoint: (url: string) => void;
  cloudApiKey: string;
  setCloudApiKey: (key: string) => void;
  cloudModel: string;
  setCloudModel: (model: string) => void;

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
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: 'chat',
  setActiveTab: (activeTab) => set({ activeTab }),

  appPaths: null,
  scannedModels: [],
  scannedVrms: [],
  activeVrmPath: null,
  setActiveVrmPath: (activeVrmPath) => {
    set({ activeVrmPath });
    get().saveCurrentSettings();
  },

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

  fetchLayerRecommendation: async (modelSizeMb, totalLayers, contextSize) => {
    try {
      const rec = await api.getLayerRecommendation(modelSizeMb, totalLayers, contextSize);
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
    } catch (e) {
      console.error('Failed to start server:', e);
    }
  },

  stopServer: async () => {
    try {
      await api.stopLlamaServer();
      await get().fetchServerStatus();
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
      if (!modelPath && models.length > 0) {
        modelPath = models[0].path;
      }

      let vrmPath = settings.active_vrm_path;
      if (!vrmPath && vrms.length > 0) {
        vrmPath = vrms[0].path;
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
        cloudEndpoint: settings.cloud_endpoint || 'https://openrouter.ai/api/v1/chat/completions',
        cloudApiKey: settings.cloud_api_key || '',
        cloudModel: settings.cloud_model || 'anthropic/claude-3.5-sonnet',
        replyLanguage: settings.reply_language || 'Deutsch',
        lorebookScanDepth: settings.lorebook_scan_depth || 5,
        activeVrmPath: vrmPath,
      });

      // 4. Load Personas
      const loadedPersonas = await api.loadPersonas();
      if (loadedPersonas.length > 0) {
        const foundPersona = loadedPersonas.find((p) => p.id === settings.active_persona_id);
        set({
          personas: loadedPersonas,
          activePersona: foundPersona || loadedPersonas[0],
        });
      }

      // 5. Scan Characters
      await get().refreshCharacters();

      // If active character was saved in settings, restore it
      if (settings.active_character_id) {
        const char = get().availableCharacters.find((c) => c.id === settings.active_character_id);
        if (char) {
          await get().selectCharacter(char);
        }
      }
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
        cloud_endpoint: state.cloudEndpoint,
        cloud_api_key: state.cloudApiKey,
        cloud_model: state.cloudModel,
        reply_language: state.replyLanguage,
        lorebook_scan_depth: state.lorebookScanDepth,
        active_character_id: state.activeCharacter?.id || null,
        active_persona_id: state.activePersona?.id || null,
        active_vrm_path: state.activeVrmPath,
      };
      await api.saveSettings(settings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  // Cognitive Soul Memory (Phase 5)
  cognitiveOverview: null,
  isMemoryLoading: false,

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

  // Soul Stage (Phase 6)
  stageState: null,
  lastDiceRoll: null,
  isRollingDice: false,

  fetchStageState: async () => {
    try {
      const state = await api.getStageState();
      set({ stageState: state });
    } catch (e) {
      console.error('Failed to fetch stage state:', e);
    }
  },

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

  // Characters & Lorebooks (Phase 3 & 8)
  activeCharacter: null,
  availableCharacters: [],
  activeLorebooks: [],
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
  },

  refreshCharacters: async () => {
    try {
      const chars = await api.scanCharacters();
      if (chars.length > 0) {
        set({ availableCharacters: chars });
        if (!get().activeCharacter) {
          get().selectCharacter(chars[0]);
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
        const remaining = get().availableCharacters;
        if (remaining.length > 0) {
          get().selectCharacter(remaining[0]);
        }
      }
    } catch (e) {
      console.error('Failed to delete character:', e);
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
        const newSession = await api.createChatSession(charId, 'Neuer Chat');
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
        const targetId = currentActive ? currentActive.id : sessions[0].id;
        await get().switchChatSession(targetId);
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
      const sessionTitle = title || `Gespräch ${get().chatSessions.length + 1}`;
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
      activeCharacter,
      activeLorebooks,
      stateVariables,
      activePersona,
      replyLanguage,
      sampling,
      lorebookScanDepth,
      chatSessions,
    } = get();

    if (!activeChatId || !activeCharacter) return;
    const targetMsg = storedMessages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    // Messages before this message
    const priorStored = storedMessages.filter((m) => m.order_index < targetMsg.order_index);
    const priorFlat: ChatMessage[] = priorStored.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      thought: m.thought || undefined,
    }));

    set({ isGenerating: true, streamingText: '', streamingThought: '' });

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    // Build context
    const scanDepth = Math.max(1, lorebookScanDepth || 5);
    const recentContext = priorFlat
      .slice(-scanDepth)
      .map((m) => m.content)
      .join(' ');

    const matchedLore = [];
    for (const lb of activeLorebooks) {
      const entries = await api.evaluateLorebookContext(lb, recentContext);
      matchedLore.push(...entries);
    }

    const promptText = await api.assemblePrompt({
      char_name: activeCharacter.card.data.name,
      user_name: activePersona.name,
      character: activeCharacter.card.data,
      active_lore: matchedLore,
      state_variables: stateVariables,
      cognitive: get().cognitiveOverview || undefined,
      reply_language: replyLanguage || 'Deutsch',
      allow_reasoning: serverConfig.reasoning_mode,
      author_note: activeSession?.author_note,
      author_note_depth: activeSession?.author_note_depth,
    });

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
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          temperature: sampling.temperature ?? 0.7,
          min_p: sampling.min_p ?? 0.05,
          top_p: sampling.top_p ?? 0.9,
          max_tokens: sampling.max_tokens ?? 2048,
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
      activeCharacter,
      activeLorebooks,
      stateVariables,
      activePersona,
      replyLanguage,
      sampling,
      lorebookScanDepth,
      chatSessions,
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

    const activeSession = chatSessions.find((s) => s.id === activeChatId);

    const scanDepth = Math.max(1, lorebookScanDepth || 5);
    const recentContext = historyFlat
      .slice(-scanDepth)
      .map((m) => m.content)
      .join(' ');

    const matchedLore = [];
    for (const lb of activeLorebooks) {
      const entries = await api.evaluateLorebookContext(lb, recentContext);
      matchedLore.push(...entries);
    }

    const promptText = await api.assemblePrompt({
      char_name: activeCharacter.card.data.name,
      user_name: activePersona.name,
      character: activeCharacter.card.data,
      active_lore: matchedLore,
      state_variables: stateVariables,
      cognitive: get().cognitiveOverview || undefined,
      reply_language: replyLanguage || 'Deutsch',
      allow_reasoning: serverConfig.reasoning_mode,
      author_note: activeSession?.author_note,
      author_note_depth: activeSession?.author_note_depth,
    });

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
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          temperature: sampling.temperature ?? 0.7,
          min_p: sampling.min_p ?? 0.05,
          top_p: sampling.top_p ?? 0.9,
          max_tokens: sampling.max_tokens ?? 2048,
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
      activePersona,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      activeLorebooks,
      stateVariables,
      replyLanguage,
      sampling,
      lorebookScanDepth,
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
      const scanDepth = Math.max(1, lorebookScanDepth || 5);
      const recentContext = updatedFlat
        .slice(-scanDepth)
        .map((m) => m.content)
        .join(' ');

      const matchedLore = [];
      for (const lb of activeLorebooks) {
        const entries = await api.evaluateLorebookContext(lb, recentContext);
        matchedLore.push(...entries);
      }

      const promptText = await api.assemblePrompt({
        char_name: activeCharacter.card.data.name,
        user_name: activePersona.name,
        character: activeCharacter.card.data,
        active_lore: matchedLore,
        state_variables: stateVariables,
        cognitive: get().cognitiveOverview || undefined,
        reply_language: replyLanguage || 'Deutsch',
        allow_reasoning: serverConfig.reasoning_mode,
        author_note: activeSession?.author_note,
        author_note_depth: activeSession?.author_note_depth,
      });

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
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: payloadMessages,
        reasoning_mode: serverConfig.reasoning_mode,
        sampling: {
          temperature: sampling.temperature ?? 0.7,
          min_p: sampling.min_p ?? 0.05,
          top_p: sampling.top_p ?? 0.9,
          max_tokens: sampling.max_tokens ?? 2048,
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
}));
