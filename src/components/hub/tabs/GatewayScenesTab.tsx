import { registryText } from '../registryText';
import { useEffect, useState } from 'react';
import { Dice5 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { translate, useTranslation } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { hubStatus, matchesQuery, useHubStore } from '../hubStore';
import { HubListState, HubStatusBadge, NsfwBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { importSceneTask, installScene as install, sceneHubId as hubId } from '../hubInstall';
import { CollectionCard, HubSectionTitle, groupByCollection, useCollectionLists } from '../collections';
import type { GatewaySceneEntry } from '../../../types';

/** Soul Stage scenarios from the gateway registry. */
export const GatewayScenesTab = () => {
  const { t, tPlural, currentLanguage } = useTranslation();
  const text = (scene: GatewaySceneEntry, field: 'title' | 'description' | 'starting_location') =>
    registryText(scene, field, scene[field], currentLanguage);
  const { list, query, importingId, ensureLoaded, load, runImport, installed, loadInstalled } = useHubStore(
    useShallow((s) => ({ list: s.scenes, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadScenes, runImport: s.runImport, installed: s.installed, loadInstalled: s.loadInstalled }))
  );
  const [updatingAll, setUpdatingAll] = useState(false);
  const statusOf = (scene: GatewaySceneEntry) => hubStatus(installed, 'scene', hubId(scene), scene.revision);

  useEffect(() => ensureLoaded('scenes'), [ensureLoaded]);

  const visible = list.items.filter((sc) =>
    matchesQuery(query, sc.title, text(sc, 'title'), sc.description, text(sc, 'description'), sc.author, text(sc, 'starting_location'))
  );

  const { collections } = useCollectionLists();
  const { groups, rest } = groupByCollection(collections, (c) => c.scenes, list.items, visible, hubId, query, currentLanguage);

  const handleImport = (scene: GatewaySceneEntry) => runImport(scene.title, () => importSceneTask(scene, statusOf(scene)));

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
      visibleCount={groups.length + rest.length}
      loadingText={t('hub.loadingScenes')}
      emptyText={t('hub.noScenes')}
      emptyIcon={Dice5}
      loadingLayout="cards"
      errorText={(error) => t('hub.loadError', { error })}
      onRetry={load}
    >
      {groups.length > 0 && (
        <section className="mb-8">
          <HubSectionTitle>{t('hub.collections')}</HubSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((collection) => <CollectionCard key={collection.id} collection={collection} />)}
          </div>
        </section>
      )}
      {groups.length > 0 && rest.length > 0 && <HubSectionTitle>{t('hub.singleScenes')}</HubSectionTitle>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rest.map((scene) => (
          <div
            key={scene.title}
            className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Dice5 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors">{text(scene, 'title')}</h3>
              </div>
              <div className="mb-2">
                <HubStatusBadge status={statusOf(scene)} updated={scene.updated} />
                <NsfwBadge nsfw={scene.nsfw} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{text(scene, 'description') || t('hub.noDescription')}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {t('hub.startLocation')}: <span className="text-slate-300">{text(scene, 'starting_location')}</span>
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
