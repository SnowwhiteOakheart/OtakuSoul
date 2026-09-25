import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  HardwareInfo,
  LayerRecommendation,
  ServerStatus,
  LlamaServerConfig,
  ChatRequest,
  DoneEvent,
} from '../types';

export const api = {
  // Hardware
  getHardwareInfo: async (): Promise<HardwareInfo> => {
    return await invoke<HardwareInfo>('get_hardware_info');
  },

  getLayerRecommendation: async (
    modelSizeMb: number,
    totalLayers: number,
    contextSize: number
  ): Promise<LayerRecommendation> => {
    return await invoke<LayerRecommendation>('get_layer_recommendation', {
      modelSizeMb,
      totalLayers,
      contextSize,
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

  // Chat & Inference
  sendChatMessage: async (request: ChatRequest): Promise<DoneEvent> => {
    return await invoke<DoneEvent>('send_chat_message', { request });
  },

  abortChatGeneration: async (): Promise<void> => {
    return await invoke<void>('abort_chat_generation');
  },

  // Streaming Listeners
  onLlmToken: async (callback: (text: string) => void): Promise<UnlistenFn> => {
    return await listen<{ text: string }>('llm-token', (event) => {
      callback(event.payload.text);
    });
  },

  onLlmThought: async (callback: (text: string) => void): Promise<UnlistenFn> => {
    return await listen<{ text: string }>('llm-thought', (event) => {
      callback(event.payload.text);
    });
  },

  onLlmDone: async (callback: (data: DoneEvent) => void): Promise<UnlistenFn> => {
    return await listen<DoneEvent>('llm-done', (event) => {
      callback(event.payload);
    });
  },
};
