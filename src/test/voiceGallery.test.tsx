// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/audioPlayer', () => ({ audioPlayer: { playDataUrl: vi.fn().mockResolvedValue(undefined) } }));

import { api } from '../services/api';
import { audioPlayer } from '../services/audioPlayer';
import { VoiceGallery } from '../components/voice/VoiceGallery';
import { resetApiMocks } from './mockApi';
import type { VoiceConfig } from '../types';

const draft = { engine: 'edge', voice_id: 'de-DE-KatjaNeural', local_model_id: null, kokoro: { model_path: '', voices_path: '' }, volume: '+0%', output_device_id: '', effects: null } as unknown as VoiceConfig;

beforeEach(() => {
  resetApiMocks();
  vi.mocked(api.listTtsModels).mockResolvedValue([
    { id: 'qwen3-tts-customvoice-0.6b', name: 'Qwen3-TTS 0.6B', installed: true, allowed: true, voice_design: false, languages: ['de', 'en'], voices: [{ voice_id: 'preset:vivian', label: 'Vivian', language: 'de', cloned: false }] },
    { id: 'qwen3-tts-1.7b-voicedesign', name: 'VoiceDesign', installed: true, allowed: true, voice_design: true, languages: ['de'], voices: [{ voice_id: 'preset:default', label: 'Default', language: '', cloned: false }] },
    { id: 'chatterbox', name: 'Chatterbox', installed: false, allowed: true, voice_design: false, languages: ['de'], voices: [{ voice_id: 'preset:default', label: 'Default', language: '', cloned: false }] },
  ] as never);
  vi.mocked(api.getKokoroInstallation).mockResolvedValue(null);
  vi.mocked(api.listAvailableVoices).mockResolvedValue([
    { id: 'de-AT-IngridNeural', name: 'Ingrid', locale: 'de-AT', gender: 'Female' },
    { id: 'de-DE-KatjaNeural', name: 'Katja', locale: 'de-DE', gender: 'Female' },
    { id: 'en-US-AriaNeural', name: 'Aria', locale: 'en-US', gender: 'Female' },
  ]);
  vi.mocked(api.synthesizeSpeech).mockResolvedValue('data:audio/wav;base64,AA==');
});

describe('VoiceGallery', () => {
  it('lists installed local voices and Edge voices of the language, main region first', async () => {
    const onPick = vi.fn();
    render(<VoiceGallery draft={draft} language="de" sampleText={() => 'Hallo'} gain={() => 1} onPick={onPick} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Stimmen anhören und vergleichen/ })));
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-gallery-voice'))).toEqual([
      'local:qwen3-tts-customvoice-0.6b:preset:vivian',
      'edge:de-DE-KatjaNeural',
      'edge:de-AT-IngridNeural',
    ]);
    expect(screen.getByText('Edge-TTS · de-DE · weiblich')).toBeInTheDocument();
    // The chosen voice is marked; another one is taken over with engine and model.
    expect(rows[1]!.textContent).toContain('Gewählt');
    fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ engine: 'local', voice_id: 'preset:vivian', local_model_id: 'qwen3-tts-customvoice-0.6b' }));
  });

  it('plays a preview with that voice', async () => {
    render(<VoiceGallery draft={draft} language="de" sampleText={() => 'Hallo'} gain={() => 0.5} onPick={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Stimmen anhören und vergleichen/ })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Ingrid anhören' })));
    expect(api.synthesizeSpeech).toHaveBeenCalledWith('Hallo', expect.objectContaining({ engine: 'edge', voice_id: 'de-AT-IngridNeural' }));
    expect(audioPlayer.playDataUrl).toHaveBeenCalledWith('data:audio/wav;base64,AA==', 0.5, '', null);
  });
});
