import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ api: { synthesizeSpeech: vi.fn(async (text: string) => `audio:${text}`) } }));
vi.mock('../services/audioPlayer', () => ({
  audioPlayer: { enqueue: vi.fn(), stop: vi.fn(), waitForIdle: vi.fn(async () => {}) },
  gainFromVoiceVolume: () => 1,
}));
import { StreamingTtsManager } from '../services/streamingTts';
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
});
