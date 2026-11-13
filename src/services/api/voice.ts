import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  ClonedVoice,
  KokoroDownloadProgress,
  KokoroInstallResult,
  ScannedVoice,
  SttConfig,
  TtsLocalSettings,
  TtsModelInfo,
  TtsModelProgress,
  VoiceConfig,
} from '../../types';

export const voiceApi = {
  listAvailableVoices: async (
    engine: string,
    elevenlabsApiKey = '',
    kokoroVoicesPath = '',
  ): Promise<ScannedVoice[]> => {
    return await invoke<ScannedVoice[]>('list_available_voices', {
      engine,
      elevenlabsApiKey,
      kokoroVoicesPath,
    });
  },

  getKokoroInstallation: async (): Promise<KokoroInstallResult | null> => {
    return await invoke<KokoroInstallResult | null>('get_kokoro_installation');
  },

  installKokoroModel: async (): Promise<KokoroInstallResult> => {
    return await invoke<KokoroInstallResult>('install_kokoro_model');
  },

  onKokoroDownloadProgress: async (
    callback: (data: KokoroDownloadProgress) => void,
  ): Promise<UnlistenFn> => {
    return await listen<KokoroDownloadProgress>('kokoro-download-progress', (event) => {
      callback(event.payload);
    });
  },

  synthesizeSpeech: async (text: string, config: VoiceConfig): Promise<string> => {
    return await invoke<string>('synthesize_speech', { text, config });
  },

  listTtsModels: async (): Promise<TtsModelInfo[]> => {
    return await invoke<TtsModelInfo[]>('list_tts_models');
  },

  downloadTtsModel: async (modelId: string): Promise<void> => {
    await invoke('download_tts_model', { modelId });
  },

  cancelTtsModelDownload: async (): Promise<void> => {
    await invoke('cancel_tts_model_download');
  },

  deleteTtsModel: async (modelId: string): Promise<void> => {
    await invoke('delete_tts_model', { modelId });
  },

  getTtsLocalSettings: async (): Promise<TtsLocalSettings> => {
    return await invoke<TtsLocalSettings>('get_tts_local_settings');
  },

  saveTtsLocalSettings: async (settings: TtsLocalSettings): Promise<void> => {
    await invoke('save_tts_local_settings', { settings });
  },

  listClonedVoices: async (): Promise<ClonedVoice[]> => {
    return await invoke<ClonedVoice[]>('list_cloned_voices');
  },

  createClonedVoice: async (voice: {
    name: string;
    samplesBase64: string;
    sampleRate: number;
    refText: string;
    language: string;
    consent: boolean;
  }): Promise<ClonedVoice> => {
    return await invoke<ClonedVoice>('create_cloned_voice', voice);
  },

  deleteClonedVoice: async (voiceId: string): Promise<void> => {
    await invoke('delete_cloned_voice', { voiceId });
  },

  onTtsModelProgress: async (callback: (data: TtsModelProgress) => void): Promise<UnlistenFn> => {
    return await listen<TtsModelProgress>('tts-model-progress', (event) => callback(event.payload));
  },

  transcribeSpeech: async (audioBase64: string, config: SttConfig): Promise<string> => {
    return await invoke<string>('transcribe_speech', { audioBase64, config });
  },

  getCharacterVoiceConfig: async (charId: string): Promise<VoiceConfig> => {
    return await invoke<VoiceConfig>('get_character_voice_config', { charId });
  },

  saveCharacterVoiceConfig: async (charId: string, config: VoiceConfig): Promise<void> => {
    return await invoke<void>('save_character_voice_config', { charId, config });
  },

  /** Speech detection (Silero VAD) for one recording; loads the small model on first use. */
  vadOpen: async (stream: string): Promise<void> => {
    return await invoke<void>('vad_open', { stream });
  },

  /** Speech probability (0–1) of new 16 kHz samples; `null` while a block is incomplete. */
  vadProcess: async (stream: string, samples: number[]): Promise<number | null> => {
    return await invoke<number | null>('vad_process', { stream, samples });
  },

  vadClose: async (stream: string): Promise<void> => {
    return await invoke<void>('vad_close', { stream });
  },
};
