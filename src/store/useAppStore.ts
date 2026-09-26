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
} from '../types';
import { soundFx } from '../services/soundFx';

interface AppStoreState {
  // Navigation
  activeTab: 'chat' | 'stage' | 'companion' | 'settings';
  setActiveTab: (tab: 'chat' | 'stage' | 'companion' | 'settings') => void;

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

  // Characters & Lorebooks (Phase 3)
  activeCharacter: CharacterProfile | null;
  availableCharacters: CharacterProfile[];
  activeLorebooks: Lorebook[];
  stateVariables: StateVariable[];
  userPersona: { name: string; description: string };
  setUserPersona: (persona: { name: string; description: string }) => void;
  selectCharacter: (character: CharacterProfile) => Promise<void>;
  loadPresetCharacters: () => Promise<void>;
  updateStateVariable: (name: string, value: string) => void;

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
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: 'chat',
  setActiveTab: (activeTab) => set({ activeTab }),

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
    model_path: '/home/deathtrap/development/OtakuSoul/assets/models/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf',
    port: 48596,
    context_size: 4096,
    gpu_layers: 99,
    flash_attn: true,
    reasoning_mode: false,
  },

  setServerConfig: (config) =>
    set((state) => ({ serverConfig: { ...state.serverConfig, ...config } })),

  fetchServerStatus: async () => {
    try {
      const status = await api.getLlamaServerStatus();
      set({ serverStatus: status });
    } catch (e) {
      console.error('Failed to fetch server status:', e);
    }
  },

  startServer: async () => {
    const { serverConfig } = get();
    try {
      set((state) => ({
        serverStatus: { ...state.serverStatus, state: 'starting', error_message: null },
      }));
      await api.startLlamaServer(serverConfig);
      await get().fetchServerStatus();
    } catch (e) {
      console.error('Start server error:', e);
      await get().fetchServerStatus();
    }
  },

  stopServer: async () => {
    try {
      await api.stopLlamaServer();
      await get().fetchServerStatus();
    } catch (e) {
      console.error('Stop server error:', e);
    }
  },

  // Phase 3: Characters & Lorebooks
  activeCharacter: null,
  availableCharacters: [],
  activeLorebooks: [],
  stateVariables: [
    { name: 'Zuneigung', value: '45', var_type: 'progress', max_value: 100 },
    { name: 'Stimmung', value: 'Stolz / Leicht Verlegen', var_type: 'str' },
    { name: 'Energie', value: '85', var_type: 'progress', max_value: 100 },
  ],
  userPersona: {
    name: 'Hiroki',
    description: 'Bodenständiger junger Mann mit einem für Sukkuben unwiderstehlichen Duft.',
  },

  setUserPersona: (userPersona) => set({ userPersona }),

  updateStateVariable: (name, value) => {
    set((state) => ({
      stateVariables: state.stateVariables.map((v) =>
        v.name === name ? { ...v, value } : v
      ),
    }));
  },

  // Phase 5: Cognitive Soul Memory
  cognitiveOverview: null,
  isMemoryLoading: false,

  fetchCognitiveOverview: async (charId?: string, userName?: string) => {
    const activeChar = charId || get().activeCharacter?.id;
    const user = userName || get().userPersona.name;
    if (!activeChar) return;

    set({ isMemoryLoading: true });
    try {
      const overview = await api.getCognitiveOverview(activeChar, user);
      set({ cognitiveOverview: overview, isMemoryLoading: false });
    } catch (e) {
      console.error('Failed to fetch cognitive overview:', e);
      set({ isMemoryLoading: false });
    }
  },

  updatePsychology: async (psych: PsychologyState) => {
    const activeChar = get().activeCharacter?.id;
    if (!activeChar) return;
    try {
      await api.updatePsychology(activeChar, psych);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update psychology:', e);
    }
  },

  updateRelationship: async (rel: RelationshipState) => {
    const activeChar = get().activeCharacter?.id;
    if (!activeChar) return;
    try {
      await api.updateRelationship(activeChar, rel);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to update relationship:', e);
    }
  },

  addManualMemory: async (category: string, content: string, significance: number) => {
    const activeChar = get().activeCharacter?.id;
    if (!activeChar) return;
    try {
      await api.addEpisodicMemory(activeChar, category, content, significance);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add memory:', e);
    }
  },

  addManualDiary: async (title: string, entryText: string, mood: string) => {
    const activeChar = get().activeCharacter?.id;
    if (!activeChar) return;
    try {
      await api.addDiaryEntry(activeChar, title, entryText, mood);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to add diary entry:', e);
    }
  },

  triggerEmotionalDecay: async () => {
    const activeChar = get().activeCharacter?.id;
    if (!activeChar) return;
    try {
      await api.applyEmotionalDecay(activeChar);
      await get().fetchCognitiveOverview();
    } catch (e) {
      console.error('Failed to apply emotional decay:', e);
    }
  },

  // Phase 6: Soul Stage Tabletop RPG
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

  rollDice: async (formula: string, targetDc?: number) => {
    set({ isRollingDice: true });
    soundFx.playDiceRoll();

    try {
      await new Promise((res) => setTimeout(res, 260));
      const res = await api.rollStageDice(formula, targetDc);

      if (res.is_critical_success) {
        soundFx.playCriticalSuccess();
      } else if (res.is_critical_failure) {
        soundFx.playCriticalFailure();
      }

      set({ lastDiceRoll: res, isRollingDice: false });
      return res;
    } catch (e) {
      console.error('Dice roll error:', e);
      set({ isRollingDice: false });
      return null;
    }
  },

  updateWorldState: async (world: WorldState) => {
    try {
      await api.updateWorldState(world);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to update world state:', e);
    }
  },

  setClockProgress: async (clockId: string, progress: number) => {
    try {
      await api.setClockProgress(clockId, progress);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to set clock progress:', e);
    }
  },

  addClock: async (clock: CampaignClock) => {
    try {
      await api.addClock(clock);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add clock:', e);
    }
  },

  deleteClock: async (clockId: string) => {
    try {
      await api.deleteClock(clockId);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to delete clock:', e);
    }
  },

  startEncounter: async () => {
    try {
      soundFx.playAttackHit();
      await api.startEncounter();
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

  applyCombatantDelta: async (combatantId: string, hpDelta: number, stressDelta: number) => {
    try {
      if (hpDelta < 0) {
        soundFx.playAttackHit();
      } else if (hpDelta > 0) {
        soundFx.playHealChime();
      }
      await api.applyCombatantDelta(combatantId, hpDelta, stressDelta);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to apply combatant delta:', e);
    }
  },

  addCombatantCondition: async (combatantId: string, condition: CombatCondition) => {
    try {
      await api.addCombatantCondition(combatantId, condition);
      await get().fetchStageState();
    } catch (e) {
      console.error('Failed to add combatant condition:', e);
    }
  },

  // Phase 7: Soul Companion & Tool Calling
  companionState: null,

  fetchCompanionState: async () => {
    try {
      const state = await api.getCompanionState();
      set({ companionState: state });
    } catch (e) {
      console.error('Failed to fetch companion state:', e);
    }
  },

  applyHormoneInteraction: async (interactionType: string) => {
    try {
      const hormones = await api.applyHormoneInteraction(interactionType);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones }
          : null,
      }));
    } catch (e) {
      console.error('Failed to apply hormone interaction:', e);
    }
  },

  setHormones: async (dopamine: number, cortisol: number, oxytocin: number, fatigue: number) => {
    try {
      const hormones = await api.setHormones(dopamine, cortisol, oxytocin, fatigue);
      set((state) => ({
        companionState: state.companionState
          ? { ...state.companionState, hormones }
          : null,
      }));
    } catch (e) {
      console.error('Failed to set hormones:', e);
    }
  },

  requestToolCall: async (toolName: string, args: Record<string, any>) => {
    try {
      const req = await api.requestToolCall(toolName, args);
      await get().fetchCompanionState();
      return req;
    } catch (e) {
      console.error('Failed to request tool call:', e);
      return null;
    }
  },

  resolveToolCall: async (callId: string, approved: boolean) => {
    try {
      if (approved) {
        soundFx.playHealChime();
      } else {
        soundFx.playCriticalFailure();
      }
      const res = await api.resolveToolCall(callId, approved);
      await get().fetchCompanionState();
      return res;
    } catch (e) {
      console.error('Failed to resolve tool call:', e);
      return null;
    }
  },

  updateCompanionSettings: async (settings: CompanionSettings) => {
    try {
      await api.updateCompanionSettings(settings);
      await get().fetchCompanionState();
    } catch (e) {
      console.error('Failed to update companion settings:', e);
    }
  },

  selectCharacter: async (character: CharacterProfile) => {
    set({
      activeCharacter: character,
      messages: [
        {
          role: 'assistant',
          content: character.card.data.first_mes || `Hallo, ich bin ${character.card.data.name}!`,
        },
      ],
      streamingText: '',
      streamingThought: '',
    });
    // Load cognitive overview for newly selected character
    await get().fetchCognitiveOverview(character.id, get().userPersona.name);
  },

  loadPresetCharacters: async () => {
    const candidatePaths = [
      '/home/deathtrap/development/OtakuSoul/presets/sakura-succubus-3/ayu_ikue.json',
      '/home/deathtrap/development/OtakuSoul/presets/sakura-succubus-3/cosmos.json',
      '/home/deathtrap/development/OtakuSoul/presets/sakura-succubus-3/hazel_williams.json',
      '/home/deathtrap/development/OtakuSoul/presets/cards/Akane Kurokawa.png',
      '/home/deathtrap/development/OtakuSoul/presets/cards/Makise Kurisu.png',
      '/home/deathtrap/development/OtakuSoul/presets/cards/Cosmos.png',
    ];

    const loaded: CharacterProfile[] = [];
    for (const p of candidatePaths) {
      try {
        const char = await api.loadCharacterCard(p);
        loaded.push(char);
      } catch (err) {
        console.warn(`Could not load character from ${p}:`, err);
      }
    }

    if (loaded.length > 0) {
      set({ availableCharacters: loaded });
      if (!get().activeCharacter) {
        get().selectCharacter(loaded[0]);
      }
    }

    // Try loading default world lorebook
    try {
      const lore = await api.loadLorebook(
        '/home/deathtrap/development/OtakuSoul/presets/sakura-succubus-3/lorebooks/sakura-succubus-3-welt.json'
      );
      set({ activeLorebooks: [lore] });
    } catch (e) {
      console.warn('Could not load default lorebook:', e);
    }
  },

  selectedBackend: 'local',
  setSelectedBackend: (selectedBackend) => set({ selectedBackend }),
  cloudEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  setCloudEndpoint: (cloudEndpoint) => set({ cloudEndpoint }),
  cloudApiKey: '',
  setCloudApiKey: (cloudApiKey) => set({ cloudApiKey }),
  cloudModel: 'anthropic/claude-3.5-sonnet',
  setCloudModel: (cloudModel) => set({ cloudModel }),

  messages: [],
  streamingText: '',
  streamingThought: '',
  isGenerating: false,

  sendMessage: async (content: string) => {
    const {
      messages,
      selectedBackend,
      serverConfig,
      cloudEndpoint,
      cloudApiKey,
      cloudModel,
      activeCharacter,
      activeLorebooks,
      stateVariables,
      userPersona,
    } = get();

    if (!content.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content };
    const updatedMessages = [...messages, userMsg];

    set({
      messages: updatedMessages,
      streamingText: '',
      streamingThought: '',
      isGenerating: true,
    });

    // Build context-aware system prompt if active character is set
    let systemPromptMsg: ChatMessage | null = null;
    if (activeCharacter) {
      // Evaluate matching lorebook entries against full conversation context
      const fullContext = updatedMessages.map((m) => m.content).join(' ');
      const matchedLore = [];
      for (const lb of activeLorebooks) {
        const entries = await api.evaluateLorebookContext(lb, fullContext);
        matchedLore.push(...entries);
      }

      const promptText = await api.assemblePrompt({
        char_name: activeCharacter.card.data.name,
        user_name: userPersona.name,
        character: activeCharacter.card.data,
        active_lore: matchedLore,
        state_variables: stateVariables,
        cognitive: get().cognitiveOverview || undefined,
        reply_language: 'Deutsch',
        allow_reasoning: serverConfig.reasoning_mode,
      });

      systemPromptMsg = { role: 'system', content: promptText };
    }

    const payloadMessages = systemPromptMsg
      ? [systemPromptMsg, ...updatedMessages]
      : updatedMessages;

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
          temperature: 0.7,
          min_p: 0.05,
          max_tokens: 2048,
        },
      });

      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: done.full_text,
            thought: done.full_thought.trim() ? done.full_thought : undefined,
          },
        ],
        streamingText: '',
        streamingThought: '',
        isGenerating: false,
      }));

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
            content: `⚠️ Fehler bei der Anfrage: ${e}`,
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
      console.error('Abort error:', e);
    }
  },

  clearChat: () => {
    const { activeCharacter } = get();
    set({
      messages: [
        {
          role: 'assistant',
          content: activeCharacter?.card.data.first_mes || 'Chat zurückgesetzt. Womit fangen wir an?',
        },
      ],
      streamingText: '',
      streamingThought: '',
    });
  },
}));
