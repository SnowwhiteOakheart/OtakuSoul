// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CharacterVoiceModal } from '../components/voice/CharacterVoiceModal';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, VoiceConfig } from '../types';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  vi.mocked(api.listAvailableVoices).mockResolvedValue([]);
  vi.mocked(api.onKokoroDownloadProgress).mockResolvedValue(() => {});
  useAppStore.setState({
    ...initial,
    appLanguage: 'en',
    activeCharacter: { id: 'shiori', card: { data: { name: 'Shiori' } } } as unknown as CharacterProfile,
    // Right after the start the store has no voice yet.
    activeVoiceConfig: null,
  }, true);
});

describe('voice dialog', () => {
  it('shows the saved voice even before the store has loaded it', async () => {
    vi.mocked(api.getCharacterVoiceConfig).mockResolvedValue({
      engine: 'openai', voice_id: 'nova', rate: '+0%', pitch: '+0Hz', volume: '+0%', filter_mode: 'all', custom_regex: '',
      elevenlabs_api_key: '', openai_endpoint: 'http://localhost:8880/v1/audio/speech', openai_api_key: '', openai_model: 'kokoro',
      openai_instructions: '', kokoro: { model_path: '', voices_path: '' }, local_model_id: null, output_device_id: '',
      rvc: { enabled: false, endpoint: '', api_key: '', model: '', pitch: 0, index_rate: 0.75, protect: 0.33 },
      stt: { engine: 'disabled', whisper_model_path: '', endpoint: '', api_key: '', model: '', language: '', prompt: '', vad_threshold: 0.025, vad_silence_ms: 900, input_device_id: '' },
      narrator_for_actions: false,
    } as VoiceConfig);
    render(<CharacterVoiceModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByDisplayValue('kokoro')).toBeTruthy());
    expect(api.getCharacterVoiceConfig).toHaveBeenCalledWith('shiori');
  });
});
