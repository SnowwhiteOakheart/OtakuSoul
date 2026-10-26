import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { cardVoiceDescription, loadCharacterVoiceConfig, withCardVoice } from '../services/characterVoice';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, VoiceConfig } from '../types';

import shioriCard from '../../presets/characters/shiori_amane.json';
import sotaCard from '../../presets/characters/sota_minase.json';
import lirwenCard from '../../presets/characters/lirwen.json';
import faelionCard from '../../presets/characters/faelion.json';
import thorinCard from '../../presets/crypt-of-shadows/thorin.json';
import lyraCard from '../../presets/crypt-of-shadows/lyra.json';
import finnCard from '../../presets/crypt-of-shadows/finn.json';
import altheaCard from '../../presets/crypt-of-shadows/althea.json';

const shiori = {
  id: 'shiori_amane',
  card: { data: { name: 'Shiori', extensions: { otakusoul_voice: { description: ' A soft, bookish young woman ' } } } },
} as unknown as CharacterProfile;
const plain = { id: 'plain', card: { data: { name: 'Plain', extensions: {} } } } as unknown as CharacterProfile;
const config = (own: string) => ({ engine: 'local', voice_id: '', openai_instructions: own }) as unknown as VoiceConfig;

beforeEach(() => resetApiMocks());

describe('character voice from the card', () => {
  it('reads the description of the card', () => {
    expect(cardVoiceDescription(shiori)).toBe('A soft, bookish young woman');
    expect(cardVoiceDescription(plain)).toBe('');
    expect(cardVoiceDescription(null)).toBe('');
  });

  it('fills only an empty description of the voice settings', () => {
    expect(withCardVoice(config(''), shiori).openai_instructions).toBe('A soft, bookish young woman');
    expect(withCardVoice(config('My own voice'), shiori).openai_instructions).toBe('My own voice');
    expect(withCardVoice(config(''), plain).openai_instructions).toBe('');
  });

  it('completes the saved settings of the matching character', async () => {
    vi.mocked(api.getCharacterVoiceConfig).mockResolvedValue(config(''));
    const loaded = await loadCharacterVoiceConfig('shiori_amane', [plain, null, shiori]);
    expect(api.getCharacterVoiceConfig).toHaveBeenCalledWith('shiori_amane');
    expect(loaded.openai_instructions).toBe('A soft, bookish young woman');
  });

  it('verifies that all bundled preset characters define an otakusoul_voice description', () => {
    const bundledCards = [
      shioriCard,
      sotaCard,
      lirwenCard,
      faelionCard,
      thorinCard,
      lyraCard,
      finnCard,
      altheaCard,
    ];
    for (const card of bundledCards) {
      const voiceDesc = card.data.extensions.otakusoul_voice?.description;
      expect(typeof voiceDesc, `${card.data.name} should have a voice description string`).toBe('string');
      expect(voiceDesc.trim().length, `${card.data.name} voice description should not be empty`).toBeGreaterThan(10);
    }
  });
});
