import { registryText } from '../registryText';
import { memo, useEffect, useMemo } from 'react';
import { Dice5 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../../i18n';
import { hubStatus, useHubStore } from '../hubStore';
import { HubListState, HubStatusBadge, NsfwBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { importSceneTask, sceneHubId as hubId } from '../hubInstall';
import { useUpdateAll } from '../hubUpdates';
import { CollectionLink, sceneMatches, useCollectionIndex } from '../collections';
import type { GatewayCollectionEntry, GatewaySceneEntry } from '../../../types';

/** All Soul Stage scenarios from the gateway registry, each with the collection it belongs to. */
export const GatewayScenesTab = () => {
  const { t, currentLanguage } = useTranslation();
  const { list, query, ensureLoaded, load, installed } = useHubStore(
    useShallow((s) => ({ list: s.scenes, query: s.query, ensureLoaded: s.ensureLoaded, load: s.loadScenes, installed: s.installed }))
  );
  useEffect(() => ensureLoaded('scenes'), [ensureLoaded]);
  const index = useCollectionIndex();

  const visible = list.items.filter((scene) => sceneMatches(scene, query, currentLanguage));
  const outdated = useMemo(() => list.items.filter((scene) => hubStatus(installed, 'scene', hubId(scene), scene.revision) === 'update'), [list.items, installed]);
  const updates = useUpdateAll({ scenes: outdated });

  return (
    <>
      <UpdateAllBar count={updates.count} busy={updates.busy} onClick={() => void updates.run()} />
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
        <SceneGrid items={visible} collectionOf={(scene) => index.get(scene)} />
      </HubListState>
    </>
  );
};

export const SceneGrid = ({ items, collectionOf }: {
  items: GatewaySceneEntry[];
  collectionOf?: (scene: GatewaySceneEntry) => GatewayCollectionEntry | undefined;
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {items.map((scene) => (
      <SceneCard key={`${hubId(scene)}|${scene.nsfw}`} scene={scene} collection={collectionOf?.(scene)} />
    ))}
  </div>
);

/** One stage scenario with its install button. */
const SceneCard = memo(({ scene, collection }: { scene: GatewaySceneEntry; collection?: GatewayCollectionEntry }) => {
  const { t, currentLanguage } = useTranslation();
  const text = (field: 'title' | 'description' | 'starting_location') => registryText(scene, field, scene[field], currentLanguage);
  const { busy, status, runImport } = useHubStore(
    useShallow((s) => ({
      busy: s.importingId === scene.title,
      status: hubStatus(s.installed, 'scene', hubId(scene), scene.revision),
      runImport: s.runImport,
    }))
  );
  return (
    <div className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 transition-all p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Dice5 className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors">{text('title')}</h3>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <HubStatusBadge status={status} updated={scene.updated} />
          <NsfwBadge nsfw={scene.nsfw} />
          <CollectionLink collection={collection} />
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">{text('description') || t('hub.noDescription')}</p>
        <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            {t('hub.startLocation')}: <span className="text-slate-300">{text('starting_location')}</span>
          </span>
          <span>
            {t('hub.author')}: <span className="text-slate-300">{scene.author}</span>
          </span>
        </div>
      </div>
      <ImportButton
        busy={busy}
        onClick={() => void runImport(scene.title, () => importSceneTask(scene, status))}
        label={hubButtonLabel(status, t('hub.importScene'))}
        status={status}
        busyLabel={t('hub.importingScene')}
        className="mt-4 w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
      />
    </div>
  );
});
