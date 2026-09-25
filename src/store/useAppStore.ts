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
} from '../types';

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
    model_path: '/home/deathtrap/development/Soul-of-Waifu-linux/assets/local_llm/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf',
    port: 48596,
    context_size: 4096,
    gpu_layers: 99,
    flash_attn: true,
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
  },

  loadPresetCharacters: async () => {
    const candidatePaths = [
      '/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/ayu_ikue.json',
      '/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/cosmos.json',
      '/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/hazel_williams.json',
      '/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/_temp/gateway_cache/Akane Kurokawa.png',
      '/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/_temp/gateway_cache/Makise Kurisu.png',
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
        '/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/lorebooks/sakura-succubus-3-welt.json'
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
        reply_language: 'Deutsch',
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
