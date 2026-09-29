import { useEffect } from 'react';
import { Dice5 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { matchesQuery, useHubStore } from '../hubStore';
import { HubListState, ImportButton } from '../hubParts';
import type { GatewaySceneEntry } from '../../../types';

/** Soul Stage scenarios from the gateway registry. */
export const GatewayScenesTab = () => {
  const { t } = useTranslation();
  const { list, query, importingId, ensureLoaded, load, runImport } = useHubStore(
    useShallow((s) => ({ list: s.scenes, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadScenes, runImport: s.runImport }))
  );

  useEffect(() => ensureLoaded('scenes'), [ensureLoaded]);

  const visible = list.items.filter((sc) =>
    matchesQuery(query, sc.title, sc.description, sc.author, sc.starting_location)
  );

  const handleImport = (scene: GatewaySceneEntry) =>
    runImport(scene.title, async () => {
      const res = await api.importSceneFromGateway(scene.download_url, scene.title);
      await useAppStore.getState().fetchStageScenes();
      return {
        message: translate('hub.importedScene', { name: res.definition.title }),
        action: {
          label: translate('hub.startInStage'),
          onClick: async () => {
            await useAppStore.getState().loadStageScene(res.definition.id);
            useAppStore.getState().setActiveTab('stage');
          },
        },
      };
    });

  return (
    <HubListState
      list={list}
      visibleCount={visible.length}
      loadingText={t('hub.loadingScenes')}
      emptyText={t('hub.noScenes')}
      emptyIcon={Dice5}
      loadingLayout="cards"
      errorText={(error) => t('hub.loadError', { error })}
      onRetry={load}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((scene) => (
          <div
            key={scene.title}
            className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Dice5 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors">{scene.title}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{scene.description || t('hub.noDescription')}</p>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {t('hub.startLocation')}: <span className="text-slate-300">{scene.starting_location}</span>
                </span>
                <span>
                  {t('hub.author')}: <span className="text-slate-300">{scene.author}</span>
                </span>
              </div>
            </div>
            <ImportButton
              busy={importingId === scene.title}
              onClick={() => void handleImport(scene)}
              label={t('hub.importScene')}
              busyLabel={t('hub.importingScene')}
              className="mt-4 w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
            />
          </div>
        ))}
      </div>
    </HubListState>
  );
};
