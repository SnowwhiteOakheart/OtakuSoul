import { useEffect, useState } from 'react';
import { Clock, Download, ExternalLink, Flame, Globe, Loader2, Star, Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { pressable } from '../../../utils/pressable';
import { chubFilterKey, useHubStore, type ChubSort } from '../hubStore';
import { HubListState, ImportButton, characterImported } from '../hubParts';
import { ChubDetailModal, type ChubDetailState } from './ChubDetailModal';
import type { ChubSearchItem } from '../../../types';

/** Chub topic ids with their display names (tags are English on chub.ai, so not translated). */
const HUB_TAGS: [id: string, label: string][] = [
  ['anime', 'Anime'], ['fantasy', 'Fantasy'], ['romance', 'Romance'], ['adventure', 'Adventure'],
  ['sci-fi', 'Sci-Fi'], ['cyberpunk', 'Cyberpunk'], ['wholesome', 'Wholesome'], ['slice of life', 'Slice of Life'],
  ['supernatural', 'Supernatural'], ['yandere', 'Yandere'], ['tsundere', 'Tsundere'], ['comedy', 'Comedy'],
  ['rpg', 'RPG'], ['female', 'Female'], ['male', 'Male'],
];

const SORTS: { id: ChubSort; icon: typeof Flame; iconClass: string; labelKey: 'hub.sortTrending' | 'hub.sortPopular' | 'hub.sortFavorites' | 'hub.sortRecent' }[] = [
  { id: 'trending', icon: Flame, iconClass: 'text-amber-400', labelKey: 'hub.sortTrending' },
  { id: 'popular', icon: Download, iconClass: 'text-cyan-400', labelKey: 'hub.sortPopular' },
  { id: 'favorites', icon: Star, iconClass: 'text-yellow-400', labelKey: 'hub.sortFavorites' },
  { id: 'recent', icon: Clock, iconClass: 'text-emerald-400', labelKey: 'hub.sortRecent' },
];

/** Sort, tag and NSFW filters; shown in the hub's tab bar while Chub is active. */
export const ChubFilters = () => {
  const { t } = useTranslation();
  const { chubSort, chubTag, chubNsfw, setChubFilter } = useHubStore(
    useShallow((s) => ({ chubSort: s.chubSort, chubTag: s.chubTag, chubNsfw: s.chubNsfw, setChubFilter: s.setChubFilter }))
  );
  return (
    <div className="flex items-center gap-3 py-2">
      <div role="group" aria-label={t('hub.sort')} className="flex items-center gap-1 bg-app/70 p-1 rounded-xl border border-slate-800 text-xs">
        {SORTS.map(({ id, icon: Icon, iconClass, labelKey }) => (
          <button
            key={id}
            onClick={() => setChubFilter({ chubSort: id })}
            aria-pressed={chubSort === id}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
              chubSort === id
                ? 'bg-accent-600/30 text-accent-200 border border-accent-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-3 h-3 ${iconClass}`} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>

      <select
        value={chubTag}
        onChange={(e) => setChubFilter({ chubTag: e.target.value })}
        aria-label={t('hub.tagFilter')}
        className="bg-app/80 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-300 focus:outline-hidden focus:border-accent-500"
      >
        <option value="">{t('hub.allTags')}</option>
        {HUB_TAGS.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 cursor-pointer bg-app/80 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
        <input
          type="checkbox"
          checked={chubNsfw}
          onChange={(e) => setChubFilter({ chubNsfw: e.target.checked })}
          className="rounded border-slate-700 text-rose-500 focus:ring-0 focus:ring-offset-0 bg-slate-900"
        />
        <span className={`text-xs font-medium ${chubNsfw ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>NSFW</span>
      </label>
    </div>
  );
};

/** Online character archive of chub.ai with search, filters and pagination. */
export const ChubTab = () => {
  const { t } = useTranslation();
  const { list, filterKey, importingId, load, runImport } = useHubStore(
    useShallow((s) => ({ list: s.chub, filterKey: chubFilterKey(s), importingId: s.importingId, load: s.loadChub, runImport: s.runImport }))
  );
  const [detail, setDetail] = useState<ChubDetailState | null>(null);

  // Search again (debounced) whenever query or filters change; cached results are reused.
  useEffect(() => {
    if (filterKey === list.loadedKey && list.loaded) return;
    const timer = setTimeout(() => void load(1, false), 300);
    return () => clearTimeout(timer);
  }, [filterKey, list.loaded, list.loadedKey, load]);

  const openDetail = async (item: ChubSearchItem) => {
    setDetail({ item, detail: null, isLoading: true });
    try {
      const loaded = await api.getChubCharacterDetails(item.full_path);
      setDetail((prev) => (prev?.item === item ? { item, detail: loaded, isLoading: false } : prev));
    } catch (e) {
      console.error('Failed to load Chub character details:', e);
      setDetail((prev) => (prev ? { ...prev, isLoading: false } : null));
    }
  };

  const handleImport = async (fullPath: string) => {
    const ok = await runImport(fullPath, async () =>
      characterImported(await api.importChubCharacter(fullPath), 'hub.chatNow')
    );
    if (ok) setDetail(null);
  };

  return (
    <>
      <HubListState
        list={list}
        visibleCount={list.items.length}
        loadingText={t('hub.loadingChub')}
        emptyText={t('hub.noCharacters')}
        emptyIcon={Globe}
        spinnerClass="text-cyan-400"
        errorText={(error) => t('hub.chubLoadError', { error })}
        onRetry={() => void load(1, false)}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {list.items.map((item) => (
            <div
              key={item.full_path}
              {...pressable(() => void openDetail(item))}
              className="group cursor-pointer rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/50 transition-all p-3 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-cyan-950/20 outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <div>
                <div className="aspect-[3/4] w-full rounded-xl bg-app overflow-hidden relative mb-2.5 border border-slate-800">
                  {item.avatar_url ? (
                    <img
                      src={item.avatar_url}
                      alt={item.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Users className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-white/90">
                    {item.star_count > 0 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur font-mono border border-white/10">
                        <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                        {item.star_count}
                      </span>
                    )}
                    {item.n_tokens > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur font-mono border border-white/10 ml-auto">
                        {Math.round(item.n_tokens / 100) / 10}k tok
                      </span>
                    )}
                  </div>
                  {item.nsfw_image && (
                    <div className="absolute top-2 left-2 px-1 py-0.5 rounded bg-rose-600/80 text-[11px] text-white font-bold uppercase tracking-wider">
                      NSFW
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-xs text-slate-100 truncate group-hover:text-cyan-300 transition-colors" title={item.name}>
                  {item.name}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                  {item.tagline || item.description || t('hub.noDescription')}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <ImportButton
                  busy={importingId === item.full_path}
                  onClick={() => void handleImport(item.full_path)}
                  label={t('hub.import')}
                  busyLabel={t('hub.importing')}
                  iconClass="w-3 h-3"
                  className="flex-1 py-1 px-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900/50 text-app font-bold text-xs flex items-center justify-center gap-1 transition-colors shadow-sm"
                />
                <button
                  onClick={() => void openDetail(item)}
                  className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title={t('hub.details')}
                  aria-label={t('hub.details')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {list.hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => void load(list.page + 1, true)}
              disabled={list.loading}
              className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors shadow-sm"
            >
              {list.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <Download className="w-4 h-4 text-cyan-400" />
              )}
              <span>{list.loading ? t('hub.loadingMore') : t('hub.loadMorePage', { page: list.page + 1 })}</span>
            </button>
          </div>
        )}
      </HubListState>

      {detail && (
        <ChubDetailModal
          state={detail}
          importing={importingId === detail.item.full_path}
          onImport={() => void handleImport(detail.item.full_path)}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
};
