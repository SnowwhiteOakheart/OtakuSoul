import { useEffect, useState } from 'react';
import { Dice5 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { hubStatus, matchesQuery, useHubStore } from '../hubStore';
import { HubListState, HubStatusBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import type { GatewaySceneEntry } from '../../../types';

/** Soul Stage scenarios from the gateway registry. */
export const GatewayScenesTab = () => {
  const { t, tPlural } = useTranslation();
  const { list, query, importingId, ensureLoaded, load, runImport, installed, loadInstalled } = useHubStore(
    useShallow((s) => ({ list: s.scenes, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadScenes, runImport: s.runImport, installed: s.installed, loadInstalled: s.loadInstalled }))
  );
  const [updatingAll, setUpdatingAll] = useState(false);
  const hubId = (scene: GatewaySceneEntry) => scene.id || scene.title;
  const statusOf = (scene: GatewaySceneEntry) => hubStatus(installed, 'scene', hubId(scene), scene.revision);
  const install = (scene: GatewaySceneEntry) =>
    api.importSceneFromGateway(scene.download_url, scene.title, hubId(scene), scene.revision, scene.updated);

  useEffect(() => ensureLoaded('scenes'), [ensureLoaded]);

  const visible = list.items.filter((sc) =>
    matchesQuery(query, sc.title, sc.description, sc.author, sc.starting_location)
  );

  const handleImport = (scene: GatewaySceneEntry) =>
    runImport(scene.title, async () => {
      const wasInstalled = statusOf(scene) !== 'new';
      const res = await install(scene);
      await useAppStore.getState().fetchStageScenes();
      return {
        message: translate(wasInstalled ? 'hub.updatedScene' : 'hub.importedScene', { name: res.definition.title }),
        action: {
          label: translate('hub.startInStage'),
          onClick: async () => {
            await useAppStore.getState().loadStageScene(res.definition.id);
            useAppStore.getState().setActiveTab('stage');
          },
        },
      };
    });

  const outdated = list.items.filter((scene) => statusOf(scene) === 'update');
  const updateAll = async () => {
    setUpdatingAll(true);
    let done = 0;
    for (const scene of outdated) {
      try {
        await install(scene);
        done += 1;
      } catch (e) {
        toast.error(translate('hub.importFailed', { error: `${scene.title}: ${errorMessage(e)}` }));
      }
    }
    await useAppStore.getState().fetchStageScenes();
    await loadInstalled();
    setUpdatingAll(false);
    if (done) toast.success(tPlural('hub.updatedCount', done));
  };

  return (
    <>
    <UpdateAllBar count={outdated.length} busy={updatingAll} onClick={() => void updateAll()} />
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
              <div className="mb-2">
                <HubStatusBadge status={statusOf(scene)} updated={scene.updated} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{scene.description || t('hub.noDescription')}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
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
              label={hubButtonLabel(statusOf(scene), t('hub.importScene'))}
              status={statusOf(scene)}
              busyLabel={t('hub.importingScene')}
              className="mt-4 w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
            />
          </div>
        ))}
      </div>
    </HubListState>
    </>
  );
};
