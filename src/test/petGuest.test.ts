// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guestState } from '../hooks/useDesktopPetGuestBridge';
import { loadGuestCharacter, onGuestCharacterChange, saveGuestCharacter } from '../services/desktopPet';

const store = (characters: unknown[]) =>
  ({
    availableCharacters: characters,
    scannedVrms: [],
    scannedInochi2ds: [],
    scannedLive2ds: [],
    activeVrmPath: '/chat/active.vrm',
    activeInochi2dPath: '',
    activeLive2dPath: '',
    avatarMode: '3d',
    avatarMotions: [],
    appLanguage: 'de',
    theme: 'dark',
    colorMode: 'dark',
    activeCharacter: null,
  }) as never;

const character = (id: string, name: string) => ({ id, card: { data: { name } }, avatar_data_url: '' });

describe('guest pet', () => {
  it('has no figure without a known character', () => {
    expect(guestState(store([character('a', 'Ayu')]), 'missing')).toBeNull();
    expect(guestState(store([]), '')).toBeNull();
  });

  it('shows the chosen character, calm, and not the chat model', () => {
    const state = guestState(store([character('a', 'Ayu'), character('b', 'Bo')]), 'b');
    expect(state).toMatchObject({
      characterId: 'b',
      characterName: 'Bo',
      emotion: 'neutral',
      gesture: null,
      thinking: false,
      vrmPath: '',
    });
  });

  it('remembers the choice and tells listeners', () => {
    let calls = 0;
    const stop = onGuestCharacterChange(() => calls++);
    saveGuestCharacter('x');
    expect(loadGuestCharacter()).toBe('x');
    saveGuestCharacter('');
    expect(loadGuestCharacter()).toBe('');
    stop();
    saveGuestCharacter('y');
    expect(calls).toBe(2);
    saveGuestCharacter('');
  });
});
