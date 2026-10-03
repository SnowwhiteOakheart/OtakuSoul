import { useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { matchesQuery, useHubStore } from '../hubStore';
import { HubListState, ImportButton } from '../hubParts';
import type { GatewayLorebookEntry } from '../../../types';

/** World lorebooks from the gateway registry. */
export const GatewayLorebooksTab = () => {
  const { t, tPlural } = useTranslation();
  const { list, query, importingId, ensureLoaded, load, runImport } = useHubStore(
    useShallow((s) => ({ list: s.lorebooks, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadLorebooks, runImport: s.runImport }))
  );

  useEffect(() => ensureLoaded('lorebooks'), [ensureLoaded]);

  const visible = list.items.filter((lb) => matchesQuery(query, lb.name, lb.description, lb.author));

  const handleImport = (lb: GatewayLorebookEntry) =>
    runImport(lb.name, async () => {
      const res = await api.importLorebookFromGateway(lb.download_url, lb.name);
      await useAppStore.getState().refreshLorebooks();
      return {
        message: translate('hub.importedLorebook', { name: res.name, count: res.entries.length }),
        action: { label: translate('hub.viewLorebooks'), onClick: () => useAppStore.getState().setActiveTab('lorebooks') },
      };
    });

  return (
    <HubListState
      list={list}
      visibleCount={visible.length}
      loadingText={t('hub.loadingLorebooks')}
      emptyText={t('hub.noLorebooks')}
      emptyIcon={BookOpen}
      loadingLayout="cards"
      errorText={(error) => t('hub.loadError', { error })}
      onRetry={load}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((lb) => (
          <div
            key={lb.name}
            className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">{lb.name}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-medium shrink-0">
                  {tPlural('hub.entryCount', lb.entry_count)}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{lb.description || t('hub.noDescription')}</p>
              <div className="text-xs text-slate-400">
                {t('hub.author')}: <span className="text-slate-300">{lb.author}</span>
              </div>
            </div>
            <ImportButton
              busy={importingId === lb.name}
              onClick={() => void handleImport(lb)}
              label={t('hub.importLorebook')}
              busyLabel={t('hub.importingLorebook')}
              className="mt-4 w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
            />
          </div>
        ))}
      </div>
    </HubListState>
  );
};
