import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { cardVoiceDescription, loadCharacterVoiceConfig, withCardVoice } from '../services/characterVoice';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, VoiceConfig } from '../types';

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
});
