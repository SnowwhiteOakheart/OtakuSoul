import { useEffect } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { petModels } from './useDesktopPetBridge';
import {
  GUEST_LABEL,
  loadGuestCharacter,
  onGuestCharacterChange,
  PET_GUEST_READY_EVENT,
  PET_GUEST_VISIBILITY_EVENT,
  PET_STATE_EVENT,
  type PetState,
} from '../services/desktopPet';

type StoreState = ReturnType<typeof useAppStore.getState>;

/**
 * The figure of the guest pet: another character than the chat's, calm (no mood, no gestures, never
 * "thinking"). Null when no character is chosen or it is gone.
 */
export function guestState(s: StoreState, characterId: string): PetState | null {
  const character = s.availableCharacters.find((c) => c.id === characterId);
  if (!character) return null;
  return {
    characterName: character.card.data.name,
    characterId: character.id,
    // The chat's own model choice belongs to the active character, not to the guest.
    ...petModels({ ...s, activeCharacter: character, activeVrmPath: '', activeInochi2dPath: '', activeLive2dPath: '' }),
    emotion: 'neutral',
    expression: 'neutral',
    motions: s.avatarMotions,
    gesture: null,
    appLanguage: s.appLanguage,
    theme: s.theme,
    colorMode: s.colorMode,
    thinking: false,
  };
}

/**
 * Main window side of the guest pet: while its window is open it gets the chosen character's
 * figure (again when the lists of models or the choice change). Nothing comes back: the guest
 * does not chat and does not touch the companion's state.
 */
export function useDesktopPetGuestBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let open = false;
    let lastKey = '';
    let sentPortrait: string | null = null;

    const send = (force = false) => {
      if (!open) return;
      const state = guestState(useAppStore.getState(), loadGuestCharacter());
      if (!state) return;
      const portraitChanged = force || state.portrait !== sentPortrait;
      const payload: PetState = { ...state, portrait: portraitChanged ? state.portrait : undefined };
      const key = JSON.stringify({ ...payload, portrait: undefined });
      if (!force && !portraitChanged && key === lastKey) return;
      lastKey = key;
      sentPortrait = state.portrait ?? '';
      void emitTo(GUEST_LABEL, PET_STATE_EVENT, payload).catch(() => {});
    };

    const unsubscribeStore = useAppStore.subscribe((s, prev) => {
      if (
        s.availableCharacters !== prev.availableCharacters ||
        s.scannedVrms !== prev.scannedVrms ||
        s.scannedInochi2ds !== prev.scannedInochi2ds ||
        s.scannedLive2ds !== prev.scannedLive2ds ||
        s.avatarMotions !== prev.avatarMotions ||
        s.avatarMode !== prev.avatarMode ||
        s.appLanguage !== prev.appLanguage ||
        s.theme !== prev.theme ||
        s.colorMode !== prev.colorMode
      ) {
        send();
      }
    });
    const stopChoice = onGuestCharacterChange(() => send(true));
    const unlisteners = [
      listen<boolean>(PET_GUEST_VISIBILITY_EVENT, ({ payload }) => {
        open = payload;
        if (!payload) {
          lastKey = '';
          sentPortrait = null;
        }
      }),
      listen(PET_GUEST_READY_EVENT, () => {
        open = true;
        send(true);
      }),
    ];
    return () => {
      unsubscribeStore();
      stopChoice();
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
    };
  }, [enabled]);
}
