import { useEffect, useRef, useState, type RefObject } from 'react';
import { useDragScroll } from '../../hooks/useDragScroll';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, Compass, Dice5, Globe, Library, Link as LinkIcon, RotateCcw, Search, Shirt, Users, X, type LucideIcon } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { useHubStore } from './hubStore';
import { api } from '../../services/api';
import { ChubFilters, ChubTab } from './tabs/ChubTab';
import { WorldsTab, type WorldFilter } from './tabs/WorldsTab';
import { HubAvatarsTab } from './tabs/HubAvatarsTab';
import { UrlImportModal } from './UrlImportModal';
import { CollectionModal } from './CollectionModal';
import type { HubSubTab } from '../../store/slices/appSlice';

type HubTab = 'worlds' | 'chub_ai' | 'avatars';

const TABS: { id: HubTab; label: string | TranslationKey; translate: boolean; icon: LucideIcon; iconClass: string }[] = [
  { id: 'worlds', label: 'hub.tabWorlds', translate: true, icon: Library, iconClass: 'text-accent-400' },
  { id: 'chub_ai', label: 'Chub AI', translate: false, icon: Globe, iconClass: 'text-cyan-400' },
  { id: 'avatars', label: 'hub.tabAvatars', translate: true, icon: Shirt, iconClass: 'text-pink-400' },
];

/** Filters of the worlds tab: the collections, or one kind of curated content on its own. */
const WORLD_FILTERS: { id: WorldFilter; label: TranslationKey; icon: LucideIcon; iconClass: string }[] = [
  { id: 'worlds', label: 'hub.worldsAll', icon: Library, iconClass: 'text-accent-400' },
  { id: 'characters', label: 'hub.collectionCharacters', icon: Users, iconClass: 'text-accent-400' },
  { id: 'scenes', label: 'hub.tabScenes', icon: Dice5, iconClass: 'text-emerald-400' },
  { id: 'lorebooks', label: 'hub.tabLorebooks', icon: BookOpen, iconClass: 'text-amber-400' },
];

const SEARCH: Record<WorldFilter | 'chub_ai' | 'avatars', TranslationKey> = {
  worlds: 'hub.searchWorlds',
  characters: 'hub.searchGateway',
  scenes: 'hub.searchScenes',
  lorebooks: 'hub.searchLorebooks',
  chub_ai: 'hub.searchChub',
  avatars: 'hub.searchAvatars',
};

const tabOf = (sub: HubSubTab): HubTab => (sub === 'chub_ai' || sub === 'avatars' ? sub : 'worlds');

const reloadTab = async (tab: HubTab) => {
  // The registries then come from the data repositories' newest commits: GitHub's copy of
  // `main` can be minutes old right after an upload.
  if (tab !== 'chub_ai') await api.refreshHubSources().catch(() => {});
  const hub = useHubStore.getState();
  void hub.loadInstalled();
  // The avatars tab reads its lists itself; the counter makes it read them again.
  if (tab === 'avatars') return hub.reloadAvatars();
  if (tab === 'chub_ai') return hub.loadChub(1, false);
  await Promise.all([hub.loadCollections(), hub.loadGateway(), hub.loadScenes(), hub.loadLorebooks()]);
};

/**
 * Marks the panel with `data-scrolling` while it scrolls. The CSS then turns off pointer events
 * on its content, so cards passing under a resting pointer do not start hover effects.
 */
const useScrollingFlag = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let timer = 0;
    const onScroll = () => {
      if (!timer) el.dataset.scrolling = '';
      else window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        delete el.dataset.scrolling;
      }, 150);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      delete el.dataset.scrolling;
    };
  }, [ref]);
};

/** Hub: curated worlds (collections, characters, scenarios, lorebooks), the chub.ai archive and avatars. */
export const HubView = () => {
  const { t } = useTranslation();
  const { hubSubTab, setHubSubTab } = useStoreFields('hubSubTab', 'setHubSubTab');
  const hub = useHubStore(
    useShallow((s) => ({
      query: s.query,
      setQuery: s.setQuery,
      worlds: s.collections.items.length,
      characters: s.gateway.items.length,
      lorebooks: s.lorebooks.items.length,
      scenes: s.scenes.items.length,
      openCollection: s.openCollection,
    }))
  );
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const reload = () => {
    if (reloading) return;
    setReloading(true);
    void reloadTab(activeTab.id).finally(() => setReloading(false));
  };
  const panelRef = useRef<HTMLDivElement>(null);
  useDragScroll(panelRef);
  useScrollingFlag(panelRef);
  const activeTab = TABS.find((tab) => tab.id === tabOf(hubSubTab)) ?? TABS[0]!;
  const worldFilter: WorldFilter = activeTab.id === 'worlds' && hubSubTab !== 'chub_ai' && hubSubTab !== 'avatars' ? hubSubTab : 'worlds';
  const search = SEARCH[activeTab.id === 'worlds' ? worldFilter : activeTab.id];

  return (
    <div className="hub-view flex-1 flex flex-col h-full bg-app overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400 shadow-sm">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">{t('hub.title')}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 font-mono">
                {t('hub.subtitleBadge')}
              </span>
            </div>
            <p className="text-xs text-slate-400">{t('hub.intro')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64 md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={t(search)}
              aria-label={t(search)}
              value={hub.query}
              onChange={(e) => hub.setQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-app/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500/50 transition-colors"
            />
            {hub.query && (
              <button
                onClick={() => hub.setQuery('')}
                aria-label={t('hub.clearSearch')}
                title={t('hub.clearSearch')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsUrlModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
            title={t('hub.importUrlHint')}
          >
            <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('hub.importUrl')}</span>
          </button>

          <button
            onClick={reload}
            disabled={reloading}
            aria-busy={reloading}
            title={t('hub.reload')}
            aria-label={t('hub.reload')}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-60"
          >
            <RotateCcw className={`w-4 h-4 ${reloading ? 'animate-spin [animation-direction:reverse]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-x-4">
        <div role="tablist" aria-label={t('hub.tabs')} className="flex items-center gap-1 -mb-px">
          {TABS.map(({ id, label, translate, icon: Icon, iconClass }) => {
            const selected = activeTab.id === id;
            const count = id === 'chub_ai' ? null : id === 'avatars' ? 0 : hub.worlds;
            return (
              <button
                key={id}
                role="tab"
                id={`hub-tab-${id}`}
                aria-selected={selected}
                aria-controls="hub-tabpanel"
                onClick={() => setHubSubTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all outline-hidden focus-visible:bg-slate-800/60 ${
                  selected
                    ? 'border-accent-500 text-accent-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                <span>{translate ? t(label as TranslationKey) : label}</span>
                {count === null ? (
                  <span className="px-1.5 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 text-[11px] font-mono">
                    {t('hub.online')}
                  </span>
                ) : (
                  count > 0 && (
                    <span className="px-1.5 rounded-full bg-slate-800 text-[11px] text-slate-400 font-mono">{count}</span>
                  )
                )}
              </button>
            );
          })}
        </div>
        {activeTab.id === 'chub_ai' && <ChubFilters />}
        {activeTab.id === 'worlds' && (
          <div role="group" aria-label={t('hub.worldFilters')} className="flex flex-wrap items-center gap-1.5 py-2">
            {WORLD_FILTERS.map(({ id, label, icon: Icon, iconClass }) => {
              const selected = worldFilter === id;
              const count = hub[id];
              return (
                <button
                  key={id}
                  type="button"
                  id={`hub-filter-${id}`}
                  aria-pressed={selected}
                  onClick={() => setHubSubTab(id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-accent-500/60 bg-accent-500/15 text-accent-200'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                  <span>{t(label)}</span>
                  {count > 0 && <span className="font-mono text-[11px] text-slate-500">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={panelRef} id="hub-tabpanel" role="tabpanel" aria-labelledby={`hub-tab-${activeTab.id}`} className="flex-1 overflow-y-auto p-6">
        {activeTab.id === 'worlds' && <WorldsTab filter={worldFilter} />}
        {activeTab.id === 'chub_ai' && <ChubTab />}
        {activeTab.id === 'avatars' && <HubAvatarsTab />}
      </div>

      {isUrlModalOpen && <UrlImportModal onClose={() => setIsUrlModalOpen(false)} />}
      {hub.openCollection && <CollectionModal />}
    </div>
  );
};
export const SoulHubView = HubView;
export default HubView;
