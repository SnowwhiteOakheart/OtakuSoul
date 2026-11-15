import { create } from 'zustand';
import { api } from '../../services/api';
import { errorMessage } from '../../utils/errors';
import type { ImprovisedMap } from '../../types/generated/ImprovisedMap';

/**
 * Improvised battle maps (C8) of the open scene: the map of the current place, whether one is
 * being painted, and the pictures by map id (board background). Painting runs in the backend
 * (`generate_stage_battle_map`); a fight uses the map once it is there.
 */
interface BattleMapState {
  /** Installed models that paint maps; empty hides the option. Null until asked. */
  painters: string[] | null;
  /** The map of the current place (scene id + place key), or null. */
  current: { sceneId: string; map: ImprovisedMap } | null;
  /** Scene and place being painted right now. */
  painting: { sceneId: string; place: string } | null;
  error: string | null;
  images: Record<string, string>;
  /** Paint the map of each new place on its own (after the turn); off by default. */
  auto: boolean;
  setAuto: (on: boolean) => void;
  loadPainters: () => Promise<void>;
  refresh: (sceneId: string) => Promise<void>;
  /** `force`: the user asked (paints again even over a map or a thrown-away place). */
  paint: (sceneId: string, place: string, force?: boolean) => Promise<void>;
  importImage: (sceneId: string, path: string) => Promise<void>;
  discard: (sceneId: string) => Promise<void>;
  image: (sceneId: string, mapId: string) => Promise<string | null>;
}

const AUTO_KEY = 'otakusoul.stageBattleMaps';
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
};

export const useBattleMaps = create<BattleMapState>((set, get) => ({
  auto: readAuto(),
  setAuto: (on) => {
    try {
      localStorage.setItem(AUTO_KEY, String(on));
    } catch {
      // no storage: only for this session
    }
    set({ auto: on });
  },
  painters: null,
  current: null,
  painting: null,
  error: null,
  images: {},
  loadPainters: async () => {
    if (get().painters !== null) return;
    set({ painters: await api.battleMapPainters().catch(() => []) });
  },
  refresh: async (sceneId) => {
    const map = await api.stageBattleMap(sceneId).catch(() => null);
    set({ current: map ? { sceneId, map } : null });
  },
  paint: async (sceneId, place, force = false) => {
    if (get().painting) return;
    set({ painting: { sceneId, place }, error: null });
    try {
      await api.generateStageBattleMap(sceneId, force);
    } catch (e) {
      set({ error: errorMessage(e) });
    } finally {
      set({ painting: null });
      // The party may have moved on meanwhile: show the map of where it is now.
      await get().refresh(sceneId);
    }
  },
  importImage: async (sceneId, path) => {
    try {
      const map = await api.importStageBattleMap(sceneId, path);
      set({ current: { sceneId, map }, error: null });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },
  discard: async (sceneId) => {
    await api.discardStageBattleMap(sceneId);
    set({ current: null });
  },
  image: async (sceneId, mapId) => {
    const cached = get().images[mapId];
    if (cached) return cached;
    const url = await api.stageBattleMapImage(sceneId, mapId).catch(() => null);
    if (url) set((s) => ({ images: { ...s.images, [mapId]: url } }));
    return url;
  },
}));
