import { create } from 'zustand';
import { api } from '../services/api';
import {
  HardwareInfo,
  ServerStatus,
  LlamaServerConfig,
  ChatMessage,
  LayerRecommendation,
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

  selectedBackend: 'local',
  setSelectedBackend: (selectedBackend) => set({ selectedBackend }),
  cloudEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  setCloudEndpoint: (cloudEndpoint) => set({ cloudEndpoint }),
  cloudApiKey: '',
  setCloudApiKey: (cloudApiKey) => set({ cloudApiKey }),
  cloudModel: 'anthropic/claude-3.5-sonnet',
  setCloudModel: (cloudModel) => set({ cloudModel }),

  messages: [
    {
      role: 'assistant',
      content: 'Hallo! Ich bin OtakuSoul. Wie kann ich Dir heute helfen? 🌸',
    },
  ],
  streamingText: '',
  streamingThought: '',
  isGenerating: false,

  sendMessage: async (content: string) => {
    const { messages, selectedBackend, serverConfig, cloudEndpoint, cloudApiKey, cloudModel } = get();
    if (!content.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content };
    const newMessages = [...messages, userMsg];

    set({
      messages: newMessages,
      streamingText: '',
      streamingThought: '',
      isGenerating: true,
    });

    const endpoint =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;

    try {
      const done = await api.sendChatMessage({
        endpoint_url: endpoint,
        api_key: selectedBackend === 'cloud' ? cloudApiKey : undefined,
        model: selectedBackend === 'cloud' ? cloudModel : undefined,
        messages: newMessages,
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

  clearChat: () =>
    set({
      messages: [
        {
          role: 'assistant',
          content: 'Chat zurückgesetzt. Womit fangen wir an?',
        },
      ],
      streamingText: '',
      streamingThought: '',
    }),
}));
