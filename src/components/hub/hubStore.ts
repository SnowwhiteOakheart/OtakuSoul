import { create } from 'zustand';
import { api } from '../../services/api';
import { translate } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { toast, type ToastAction } from '../ui/feedback';
import type { ChubSearchItem, GatewayCharacterEntry, GatewayLorebookEntry, GatewaySceneEntry } from '../../types';

export type ChubSort = 'trending' | 'popular' | 'favorites' | 'recent';

/** One remote list with its loading state. Lists stay cached while switching hub tabs. */
export interface RemoteList<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const emptyList = <T,>(): RemoteList<T> => ({ items: [], loading: false, error: null, loaded: false });

export type ListKey = 'gateway' | 'lorebooks' | 'scenes';

interface HubState {
  query: string;
  setQuery: (query: string) => void;

  gateway: RemoteList<GatewayCharacterEntry>;
  lorebooks: RemoteList<GatewayLorebookEntry>;
  scenes: RemoteList<GatewaySceneEntry>;
  /** `loadedKey` identifies the filters the current items belong to (see `chubFilterKey`). */
  chub: RemoteList<ChubSearchItem> & { page: number; hasMore: boolean; loadedKey: string };
  chubSort: ChubSort;
  chubTag: string;
  chubNsfw: boolean;
  setChubFilter: (filter: Partial<Pick<HubState, 'chubSort' | 'chubTag' | 'chubNsfw'>>) => void;

  /** Loads a gateway list the first time its tab opens; errors wait for an explicit retry. */
  ensureLoaded: (key: ListKey) => void;
  loadGateway: () => Promise<void>;
  loadLorebooks: () => Promise<void>;
  loadScenes: () => Promise<void>;
  loadChub: (page?: number, append?: boolean) => Promise<void>;

  /** Id of the entry currently being imported, to disable its button. */
  importingId: string | null;
  /**
   * Runs an import, shows a success toast (optionally with a follow-up action) or an error
   * toast. Returns whether the import succeeded.
   */
  runImport: (id: string, task: () => Promise<{ message: string; action?: ToastAction }>) => Promise<boolean>;
}

export const useHubStore = create<HubState>()((set, get) => {
  const loadList = async <K extends ListKey>(key: K, fetch: () => Promise<HubState[K]['items']>) => {
    set((state) => ({ [key]: { ...state[key], loading: true, error: null } }) as Partial<HubState>);
    try {
      const items = await fetch();
      set({ [key]: { items, loading: false, error: null, loaded: true } } as Partial<HubState>);
    } catch (e) {
      console.error(`Failed to load hub list "${key}":`, e);
      set((state) => ({ [key]: { ...state[key], loading: false, error: errorMessage(e) } }) as Partial<HubState>);
    }
  };

  return {
    query: '',
    setQuery: (query) => set({ query }),

    gateway: emptyList(),
    lorebooks: emptyList(),
    scenes: emptyList(),
    chub: { ...emptyList<ChubSearchItem>(), page: 1, hasMore: false, loadedKey: '' },
    chubSort: 'trending',
    chubTag: '',
    chubNsfw: false,
    setChubFilter: (filter) => set(filter),

    ensureLoaded: (key) => {
      const list = get()[key];
      if (list.loaded || list.loading || list.error) return;
      void { gateway: get().loadGateway, lorebooks: get().loadLorebooks, scenes: get().loadScenes }[key]();
    },

    loadGateway: () => loadList('gateway', () => api.fetchSoulGatewayRegistry()),
    loadLorebooks: () => loadList('lorebooks', () => api.fetchLorebooksGatewayRegistry()),
    loadScenes: () => loadList('scenes', () => api.fetchStagesGatewayRegistry()),

    loadChub: async (page = 1, append = false) => {
      const { query, chubSort, chubTag, chubNsfw } = get();
      const loadedKey = chubFilterKey(get());
      set((state) => ({ chub: { ...state.chub, loading: true, error: null } }));
      try {
        const res = await api.searchChubCharacters(query, page, 24, chubSort, chubTag ? [chubTag] : undefined, chubNsfw);
        set((state) => ({
          chub: {
            items: append ? [...state.chub.items, ...res.items] : res.items,
            loading: false,
            error: null,
            loaded: true,
            page,
            hasMore: res.has_more,
            loadedKey,
          },
        }));
      } catch (e) {
        console.error('Failed to search Chub AI:', e);
        set((state) => ({ chub: { ...state.chub, loading: false, error: errorMessage(e) } }));
      }
    },

    importingId: null,
    runImport: async (id, task) => {
      set({ importingId: id });
      try {
        const { message, action } = await task();
        toast.success(message, action);
        return true;
      } catch (e) {
        console.error('Hub import failed:', e);
        toast.error(translate('hub.importFailed', { error: errorMessage(e) }));
        return false;
      } finally {
        set({ importingId: null });
      }
    },
  };
});

/** Case-insensitive match of the search query against any of the given fields. */
export const matchesQuery = (query: string, ...fields: (string | undefined)[]) => {
  const q = query.toLowerCase().trim();
  return !q || fields.some((field) => field?.toLowerCase().includes(q));
};

/** Identifies a Chub search, so switching tabs does not reload unchanged results. */
export const chubFilterKey = (s: Pick<HubState, 'query' | 'chubSort' | 'chubTag' | 'chubNsfw'>) =>
  JSON.stringify([s.query.trim(), s.chubSort, s.chubTag, s.chubNsfw]);
