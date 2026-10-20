import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({
  api: {
    synthesizeSpeech: vi.fn(async (text: string, voice: { voice_id?: string }) => `audio:${voice.voice_id ? `${voice.voice_id}:` : ''}${text}`),
    getCharacterVoiceConfig: vi.fn(async () => ({ engine: 'edge', voice_id: 'erzaehler' })),
  },
}));
vi.mock('../services/audioPlayer', () => ({
  audioPlayer: { enqueue: vi.fn(), stop: vi.fn(), waitForIdle: vi.fn(async () => {}) },
  gainFromVoiceVolume: () => 1,
}));
import { StreamingTtsManager } from '../services/streamingTts';
import { forgetNarratorVoice } from '../services/narratorVoice';
import { audioPlayer } from '../services/audioPlayer';
import type { VoiceConfig } from '../types';

const played = () => vi.mocked(audioPlayer.enqueue).mock.calls.map((call) => call[0]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sentence-wise speech while the reply streams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('holds local speech back until the reply is complete', async () => {
    const tts = new StreamingTtsManager();
    const local = { engine: 'local' } as VoiceConfig;
    tts.push('Hallo du. ', local);
    tts.push('Wie geht es? Gut', local);
    await settle();
    expect(played()).toEqual([]);
    tts.flush('', local);
    await tts.waitForIdle();
    expect(played()).toEqual(['audio:Hallo du.', 'audio:Wie geht es?', 'audio:Gut']);
  });

  it('plays other engines sentence by sentence right away', async () => {
    const tts = new StreamingTtsManager();
    tts.push('Hallo du. Noch', { engine: 'edge' } as VoiceConfig);
    await settle();
    expect(played()).toEqual(['audio:Hallo du.']);
  });

  it('drops held audio when the reply is cancelled', async () => {
    const tts = new StreamingTtsManager();
    tts.push('Hallo du. ', { engine: 'local' } as VoiceConfig);
    await settle();
    tts.cancel();
    tts.flush();
    expect(played()).toEqual([]);
  });

  it('leaves actions to the narrator when the character wants that', async () => {
    forgetNarratorVoice();
    const tts = new StreamingTtsManager();
    const shiori = { engine: 'edge', voice_id: 'shiori', narrator_for_actions: true } as VoiceConfig;
    tts.push('*Sie schiebt die Brille hoch.* „Einen?', shiori);
    tts.push(' Ich habe drei Listen.“ *lacht*', shiori);
    tts.flush('', shiori);
    await tts.waitForIdle();
    expect(played()).toEqual([
      'audio:erzaehler:Sie schiebt die Brille hoch.',
      'audio:shiori:„Einen?',
      'audio:shiori:Ich habe drei Listen.“',
      'audio:erzaehler:lacht',
    ]);
  });
});
