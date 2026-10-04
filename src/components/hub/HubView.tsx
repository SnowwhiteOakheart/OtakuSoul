import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, Compass, Dice5, Globe, Link as LinkIcon, RotateCcw, Search, Sparkles, X, type LucideIcon } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { useHubStore } from './hubStore';
import { GatewayCharactersTab } from './tabs/GatewayCharactersTab';
import { ChubFilters, ChubTab } from './tabs/ChubTab';
import { GatewayLorebooksTab } from './tabs/GatewayLorebooksTab';
import { GatewayScenesTab } from './tabs/GatewayScenesTab';
import { UrlImportModal } from './UrlImportModal';

type HubTab = 'soul_gateway' | 'chub_ai' | 'lorebooks' | 'scenes';

const TABS: { id: HubTab; label: string | TranslationKey; translate: boolean; icon: LucideIcon; iconClass: string; search: TranslationKey }[] = [
  { id: 'soul_gateway', label: 'hub.tabGateway', translate: true, icon: Sparkles, iconClass: 'text-accent-400', search: 'hub.searchGateway' },
  { id: 'chub_ai', label: 'Chub AI', translate: false, icon: Globe, iconClass: 'text-cyan-400', search: 'hub.searchChub' },
  { id: 'lorebooks', label: 'hub.tabLorebooks', translate: true, icon: BookOpen, iconClass: 'text-amber-400', search: 'hub.searchLorebooks' },
  { id: 'scenes', label: 'hub.tabScenes', translate: true, icon: Dice5, iconClass: 'text-emerald-400', search: 'hub.searchScenes' },
];

const reloadTab = (tab: HubTab) => {
  const hub = useHubStore.getState();
  return { soul_gateway: hub.loadGateway, chub_ai: () => hub.loadChub(1, false), lorebooks: hub.loadLorebooks, scenes: hub.loadScenes }[tab]();
};

/** Hub: curated gateway content and the chub.ai archive, each in its own tab. */
export const HubView = () => {
  const { t } = useTranslation();
  const { hubSubTab, setHubSubTab } = useStoreFields('hubSubTab', 'setHubSubTab');
  const hub = useHubStore(
    useShallow((s) => ({
      query: s.query,
      setQuery: s.setQuery,
      soul_gateway: s.gateway.items.length,
      lorebooks: s.lorebooks.items.length,
      scenes: s.scenes.items.length,
    }))
  );
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const activeTab = TABS.find((tab) => tab.id === hubSubTab) ?? TABS[0]!;

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4">
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
              placeholder={t(activeTab.search)}
              aria-label={t(activeTab.search)}
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
            onClick={() => void reloadTab(activeTab.id)}
            title={t('hub.reload')}
            aria-label={t('hub.reload')}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-x-4">
        <div role="tablist" aria-label={t('hub.tabs')} className="flex items-center gap-1 -mb-px">
          {TABS.map(({ id, label, translate, icon: Icon, iconClass }) => {
            const selected = activeTab.id === id;
            const count = id === 'chub_ai' ? null : hub[id];
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
      </div>

      {/* Content */}
      <div id="hub-tabpanel" role="tabpanel" aria-labelledby={`hub-tab-${activeTab.id}`} className="flex-1 overflow-y-auto p-6">
        {activeTab.id === 'soul_gateway' && <GatewayCharactersTab />}
        {activeTab.id === 'chub_ai' && <ChubTab />}
        {activeTab.id === 'lorebooks' && <GatewayLorebooksTab />}
        {activeTab.id === 'scenes' && <GatewayScenesTab />}
      </div>

      {isUrlModalOpen && <UrlImportModal onClose={() => setIsUrlModalOpen(false)} />}
    </div>
  );
};
export const SoulHubView = HubView;
export default HubView;
