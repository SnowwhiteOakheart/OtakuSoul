import { api } from '../../services/api';
import { isAdultMarked } from '../../utils/adultContent';
import type {
  CharacterProfile,
  Lorebook,
} from '../../types';
import type { SliceCreator } from '../storeTypes';
import { refersToLorebook } from '../../utils/lorebookUsage';

/** Lorebooks, global lorebooks and scene tension. */
export interface LorebookSlice {
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
  /** Binds a lorebook to a character, or removes every reference to it (id, path or name). */
  bindLorebookToCharacter: (charId: string, lorebook: Lorebook, bound: boolean) => Promise<void>;
  lorebookScanDepth: number;
  setLorebookScanDepth: (depth: number) => void;
}

export const createLorebookSlice: SliceCreator<LorebookSlice> = (set, get) => ({
  lorebookScanDepth: 5,

  setLorebookScanDepth: (lorebookScanDepth) => {
    set({ lorebookScanDepth });
    get().saveCurrentSettings();
  },

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
      // An open adult lorebook that is now hidden (adult content turned off) closes.
      const active = get().activeLorebook;
      if (active && isAdultMarked(active.extensions) && !books.some((b) => b.id === active.id)) {
        set({ activeLorebook: books[0] ?? null });
      } else if (!active && books.length > 0) {
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

  bindLorebookToCharacter: async (charId, lorebook, bound) => {
    const char = get().availableCharacters.find((c) => c.id === charId);
    const ref = lorebook.id || lorebook.file_path;
    if (!char || !ref) return;
    const others = (char.bound_lorebooks || []).filter((r) => !refersToLorebook(lorebook, r));
    const updatedProfile: CharacterProfile = { ...char, bound_lorebooks: bound ? [...others, ref] : others };
    const saved = await api.saveCharacterCard(updatedProfile);
    await get().refreshCharacters();
    if (get().activeCharacter?.id === charId) set({ activeCharacter: saved });
  },
});
