import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ api: { getCharacterVoiceConfig: vi.fn() } }));
import { api } from '../services/api';
import { forgetNarratorVoice, splitActions, voiceParts } from '../services/narratorVoice';
import type { VoiceConfig } from '../types';

describe('narrator for actions', () => {
  it('splits a reply into words and actions', () => {
    expect(splitActions('*winkt*  "Hallo!" Und dann **lacht sie** laut. *geht')).toEqual([
      { action: true, text: 'winkt' },
      { action: false, text: '"Hallo!" Und dann' },
      { action: true, text: 'lacht sie' },
      { action: false, text: 'laut.' },
      { action: true, text: 'geht' },
    ]);
    expect(splitActions('Nur Worte.')).toEqual([{ action: false, text: 'Nur Worte.' }]);
    expect(splitActions('*a* *b*')).toEqual([{ action: true, text: 'a b' }]);
  });

  it('keeps one voice when the character does not want the narrator or there is none', async () => {
    const voice = { engine: 'edge', voice_id: 'shiori', narrator_for_actions: false } as VoiceConfig;
    expect(await voiceParts('*winkt* Hallo', voice)).toEqual([{ text: '*winkt* Hallo', voice }]);
    forgetNarratorVoice();
    vi.mocked(api.getCharacterVoiceConfig).mockResolvedValue({ engine: 'disabled' } as VoiceConfig);
    const wants = { ...voice, narrator_for_actions: true };
    expect(await voiceParts('*winkt* Hallo', wants)).toEqual([{ text: '*winkt* Hallo', voice: wants }]);
    forgetNarratorVoice();
    const narrator = { engine: 'edge', voice_id: 'erzaehler' } as VoiceConfig;
    vi.mocked(api.getCharacterVoiceConfig).mockResolvedValue(narrator);
    expect(await voiceParts('*winkt* Hallo', wants)).toEqual([{ text: 'winkt', voice: narrator }, { text: 'Hallo', voice: wants }]);
  });
});
