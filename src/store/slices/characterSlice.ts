import { api } from '../../services/api';
import { soundFx } from '../../services/soundFx';
import type {
  CharacterProfile,
  StateVariable,
  UserPersona,
  CharacterDraft,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

/** Characters, personas, state variables and the AI character assistant. */
export interface CharacterSlice {
  activeCharacter: CharacterProfile | null;
  availableCharacters: CharacterProfile[];
  stateVariables: StateVariable[];
  selectCharacter: (character: CharacterProfile) => Promise<void>;
  refreshCharacters: () => Promise<void>;
  loadPresetCharacters: () => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
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
    set({ activePersona: persona, cognitiveOverview: null, memoryOverviewError: null, isMemoryLoading: false, characterMarkdown: '', userMarkdown: '' });
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
      console.error('Failed to delete persona:', e);
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
    await get().loadChatSessions(character.id);
    await get().fetchCognitiveOverview(character.id, get().activePersona.name);
    await get().loadVoiceConfigForCharacter(character.id);
  },

  refreshCharacters: async () => {
    try {
      const chars = await api.scanCharacters();
      const firstChar = chars[0];
      if (firstChar) {
        set({ availableCharacters: chars });
        if (!get().activeCharacter) {
          get().selectCharacter(firstChar);
        }
      }
    } catch (e) {
      console.error('Failed to scan characters:', e);
    }
  },

  loadPresetCharacters: async () => {
    await get().refreshCharacters();

    // Try loading default world lorebook if presets dir available
    const paths = get().appPaths;
    if (paths) {
      const candidateLorebook = `${paths.bundled_presets_dir}/sakura-succubus-3/lorebooks/sakura-succubus-3-welt.json`;
      try {
        const lore = await api.loadLorebook(candidateLorebook);
        set({ activeLorebooks: [lore] });
      } catch (e) {
        console.warn('Could not load default lorebook:', e);
      }
    }
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
      return null;
    }
  },
});
