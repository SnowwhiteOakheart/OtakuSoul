import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import { isAdultMarked } from '../../utils/adultContent';
import type {
  AvatarKind,
  CharacterProfile,
  StateVariable,
  UserPersona,
  CharacterDraft,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { reportFailure } from '../reportFailure';

/** Characters, personas, state variables and the AI character assistant. */
export interface CharacterSlice {
  activeCharacter: CharacterProfile | null;
  availableCharacters: CharacterProfile[];
  stateVariables: StateVariable[];
  selectCharacter: (character: CharacterProfile) => Promise<void>;
  /** Rescans the library; without an open character it opens `preferredId` (else the first). */
  refreshCharacters: (preferredId?: string | null) => Promise<void>;
  loadPresetCharacters: () => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
  /**
   * Gives a character its own 3D or Live2D model (`null` = back to the default avatar). The card is
   * saved; errors go to the caller.
   */
  assignCharacterAvatar: (charId: string, kind: AvatarKind, model: string | null) => Promise<void>;
  restoreHiddenCharacters: () => Promise<void>;
  updateStateVariable: (name: string, value: string) => void;
  personas: UserPersona[];
  activePersona: UserPersona;
  selectPersona: (persona: UserPersona) => void;
  savePersona: (persona: UserPersona) => Promise<void>;
  deletePersona: (personaId: string) => Promise<void>;
  characterWizardOpen: boolean;
  setCharacterWizardOpen: (open: boolean) => void;
  createCharacterFromDraft: (draft: CharacterDraft) => Promise<CharacterProfile | null>;
}

let pendingPreferredCharacterId: string | null | undefined;
export const setPendingPreferredCharacterId = (id: string | null | undefined) => {
  pendingPreferredCharacterId = id;
};

export const createCharacterSlice: SliceCreator<CharacterSlice> = (set, get) => ({
  personas: [
    {
      id: 'default_user',
      name: 'User',
      description: 'Ein wissbegieriger Abenteurer und Gesprächspartner.',
    },
  ],

  activePersona: {
    id: 'default_user',
    name: 'User',
    description: 'Ein wissbegieriger Abenteurer und Gesprächspartner.',
  },

  selectPersona: (persona) => {
    set({ activePersona: persona, cognitiveOverview: null, memoryOverviewError: null, memoryMarkdownError: null, isMemoryMarkdownLoading: false, memoryReflectionError: null, lastReflectionResult: null, isMemoryLoading: false, characterMarkdown: '', userMarkdown: '' });
    get().saveCurrentSettings();
  },

  savePersona: async (persona) => {
    const updated = await api.savePersona(persona);
    set({ personas: updated });
    if (get().activePersona.id === persona.id) {
      set({ activePersona: persona });
      get().saveCurrentSettings();
    }
  },

  deletePersona: async (personaId) => {
    try {
      const updated = await api.deletePersona(personaId);
      set({ personas: updated });
      if (get().activePersona.id === personaId) {
        set({ activePersona: updated[0] });
      }
    } catch (e) {
      reportFailure('Failed to delete persona:', e);
    }
  },

  activeCharacter: null,

  availableCharacters: [],

  stateVariables: [
    { name: 'Affection', value: '45', var_type: 'progress', max_value: 100 },
    { name: 'Energy', value: '80', var_type: 'progress', max_value: 100 },
    { name: 'Mood', value: 'Glücklich', var_type: 'str' },
  ],

  updateStateVariable: (name, value) =>
    set((state) => ({
      stateVariables: state.stateVariables.map((v) =>
        v.name === name ? { ...v, value } : v
      ),
    })),

  selectCharacter: async (character) => {
    set({
      activeCharacter: character,
      cognitiveOverview: null,
      memoryOverviewError: null,
      memoryMarkdownError: null,
      isMemoryMarkdownLoading: false,
      memoryReflectionError: null,
      lastReflectionResult: null,
      isMemoryLoading: false,
      memoryBackups: [],
      memoryBackupsError: null,
      isLoadingBackups: false,
      characterMarkdown: '',
      userMarkdown: '',
      streamingText: '',
      streamingThought: '',
    });
    get().saveCurrentSettings();
    // The voice loads alongside, not after the chats and the memory (the voice dialog and
    // read-aloud need it right away).
    const voice = get().loadVoiceConfigForCharacter(character.id);
    await get().loadChatSessions(character.id);
    await get().fetchCognitiveOverview(character.id, get().activePersona.name);
    await voice;
  },

  refreshCharacters: async (preferredId) => {
    // Before the settings are loaded the last opened character isn't known yet; a scan started
    // then must not pick one, even if it only finishes afterwards (it would show the wrong one).
    const knewSettings = get().settingsLoaded;
    if (preferredId !== undefined) pendingPreferredCharacterId = preferredId;
    try {
      const chars = await api.scanCharacters();
      const firstChar = chars[0];
      if (firstChar) {
        set({ availableCharacters: chars });
        // An open adult character that is now hidden (adult content turned off) closes.
        const active = get().activeCharacter;
        const hiddenActive = !!active && isAdultMarked(active.card.data.extensions) && !chars.some((c) => c.id === active.id);
        if ((!active || hiddenActive) && knewSettings && get().settingsLoaded) {
          const targetId = preferredId ?? pendingPreferredCharacterId;
          pendingPreferredCharacterId = undefined;
          await get().selectCharacter(chars.find((c) => c.id === targetId && !hiddenActive) ?? firstChar);
        }
      }
    } catch (e) {
      console.error('Failed to scan characters:', e);
    }
  },

  assignCharacterAvatar: async (charId, kind, model) => {
    const char = get().availableCharacters.find((c) => c.id === charId);
    if (!char) return;
    const extensions = { ...(char.card.data.extensions || {}) };
    // The old Soul of Waifu keys would win over an emptied custom key.
    const [key, legacy] =
      kind === 'vrm' ? ['custom_vrm', 'sow_vrm'] : kind === 'live2d' ? ['custom_live2d', 'sow_live2d'] : ['custom_inochi2d', ''];
    if (legacy) delete extensions[legacy];
    if (model) extensions[key] = model;
    else delete extensions[key];
    const updated: CharacterProfile = { ...char, card: { ...char.card, data: { ...char.card.data, extensions } } };
    const saved = await api.saveCharacterCard(updated);
    await get().refreshCharacters();
    if (get().activeCharacter?.id === charId) set({ activeCharacter: saved });
  },

  loadPresetCharacters: async () => {
    // Opening the chat again needs no new scan: saves, imports and deletions refresh themselves.
    if (get().availableCharacters.length > 0 && get().activeCharacter) return;
    await get().refreshCharacters();
  },

  deleteCharacter: async (charId) => {
    try {
      await api.deleteCharacter(charId);
      await get().refreshCharacters();
      if (get().activeCharacter?.id === charId) {
        const nextCharacter = get().availableCharacters[0];
        if (nextCharacter) {
          get().selectCharacter(nextCharacter);
        }
      }
    } catch (e) {
      console.error('Failed to delete character:', e);
      throw e;
    }
  },

  restoreHiddenCharacters: async () => {
    try {
      await api.restoreHiddenCharacters();
      await get().refreshCharacters();
    } catch (e) {
      console.error('Failed to restore hidden characters:', e);
      throw e;
    }
  },

  characterWizardOpen: false,

  setCharacterWizardOpen: (open) => set({ characterWizardOpen: open }),

  createCharacterFromDraft: async (draft) => {
    try {
      const profile = await api.createCharacterFromDraft(draft);
      await get().refreshCharacters();
      soundFx.playLevelUp();
      return profile;
    } catch (e) {
      console.error('Failed to create character from draft:', e);
      throw e;
    }
  },
});
