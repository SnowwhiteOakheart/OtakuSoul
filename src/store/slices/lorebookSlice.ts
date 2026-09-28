import { api } from '../../services/api';
import type {
  CharacterProfile,
  Lorebook,
} from '../../types';
import type { SliceCreator } from '../storeTypes';

/** Lorebooks, global lorebooks and scene tension. */
export interface LorebookSlice {
  activeLorebooks: Lorebook[];
  allLorebooks: Lorebook[];
  activeLorebook: Lorebook | null;
  currentTension: number;
  globalLorebookIds: string[];
  sceneTensionEnabled: boolean;
  setCurrentTension: (val: number) => void;
  adjustTension: (delta: number) => void;
  resetTension: () => void;
  setSceneTensionEnabled: (enabled: boolean) => void;
  refreshLorebooks: () => Promise<void>;
  selectLorebook: (lb: Lorebook | null) => void;
  saveLorebook: (lb: Lorebook) => Promise<string>;
  deleteLorebook: (filePath: string) => Promise<void>;
  importLorebook: (sourcePath: string) => Promise<Lorebook>;
  exportLorebook: (lb: Lorebook, targetPath: string) => Promise<void>;
  toggleGlobalLorebook: (lorebookId: string) => Promise<void>;
  bindLorebookToCharacter: (charId: string, lorebookId: string, bound: boolean) => Promise<void>;
  lorebookScanDepth: number;
  setLorebookScanDepth: (depth: number) => void;
}

export const createLorebookSlice: SliceCreator<LorebookSlice> = (set, get) => ({
  lorebookScanDepth: 5,

  setLorebookScanDepth: (lorebookScanDepth) => {
    set({ lorebookScanDepth });
    get().saveCurrentSettings();
  },

  activeLorebooks: [],

  allLorebooks: [],

  activeLorebook: null,

  currentTension: 0,

  globalLorebookIds: [],

  sceneTensionEnabled: true,

  setCurrentTension: (currentTension) =>
    set({ currentTension: Math.min(100, Math.max(0, currentTension)) }),

  adjustTension: (delta) =>
    set((state) => ({
      currentTension: Math.min(100, Math.max(0, state.currentTension + delta)),
    })),

  resetTension: () => set({ currentTension: 0 }),

  setSceneTensionEnabled: (sceneTensionEnabled) => {
    set({ sceneTensionEnabled });
    get().saveCurrentSettings();
  },

  refreshLorebooks: async () => {
    try {
      const books = await api.listAllLorebooks();
      set({ allLorebooks: books });
      if (!get().activeLorebook && books.length > 0) {
        set({ activeLorebook: books[0] });
      }
    } catch (e) {
      console.error('Failed to list lorebooks:', e);
    }
  },

  selectLorebook: (lb) => set({ activeLorebook: lb }),

  saveLorebook: async (lb) => {
    try {
      const path = await api.saveLorebook(lb);
      await get().refreshLorebooks();
      const updated = get().allLorebooks.find((b) => b.file_path === path || b.id === lb.id);
      if (updated) {
        set({ activeLorebook: updated });
      }
      return path;
    } catch (e) {
      console.error('Failed to save lorebook:', e);
      throw e;
    }
  },

  deleteLorebook: async (filePath) => {
    try {
      await api.deleteLorebook(filePath);
      await get().refreshLorebooks();
      const remaining = get().allLorebooks;
      set({ activeLorebook: remaining.length > 0 ? remaining[0] : null });
    } catch (e) {
      console.error('Failed to delete lorebook:', e);
      throw e;
    }
  },

  importLorebook: async (sourcePath) => {
    try {
      const imported = await api.importLorebookFile(sourcePath);
      await get().refreshLorebooks();
      set({ activeLorebook: imported });
      return imported;
    } catch (e) {
      console.error('Failed to import lorebook:', e);
      throw e;
    }
  },

  exportLorebook: async (lb, targetPath) => {
    try {
      await api.exportLorebookFile(lb, targetPath);
    } catch (e) {
      console.error('Failed to export lorebook:', e);
      throw e;
    }
  },

  toggleGlobalLorebook: async (lorebookId) => {
    const current = get().globalLorebookIds;
    const exists = current.includes(lorebookId);
    const updated = exists ? current.filter((id) => id !== lorebookId) : [...current, lorebookId];
    set({ globalLorebookIds: updated });
    await get().saveCurrentSettings();
  },

  bindLorebookToCharacter: async (charId, lorebookId, bound) => {
    const char = get().availableCharacters.find((c) => c.id === charId);
    if (!char) return;
    const currentBound = char.bound_lorebooks || [];
    const updatedBound = bound
      ? Array.from(new Set([...currentBound, lorebookId]))
      : currentBound.filter((id) => id !== lorebookId);

    const updatedProfile: CharacterProfile = {
      ...char,
      bound_lorebooks: updatedBound,
    };
    await api.saveCharacterCard(updatedProfile);
    await get().refreshCharacters();
    if (get().activeCharacter?.id === charId) {
      set({ activeCharacter: updatedProfile });
    }
  },
});
