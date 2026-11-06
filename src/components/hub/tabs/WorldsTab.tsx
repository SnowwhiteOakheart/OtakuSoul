import { useEffect, useMemo } from 'react';
import { Library } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../../i18n';
import { hubStatus, useHubStore, type RemoteList } from '../hubStore';
import { HubListState, UpdateAllBar } from '../hubParts';
import { sceneHubId } from '../hubInstall';
import { useUpdateAll } from '../hubUpdates';
import {
  CollectionCard,
  HubSectionTitle,
  characterMatches,
  collectionMembers,
  groupByCollection,
  lorebookMatches,
  sceneMatches,
  useCollectionIndex,
  useCollectionLists,
} from '../collections';
import { GatewayCharacterGrid, GatewayCharactersTab } from './GatewayCharactersTab';
import { GatewayLorebooksTab, LorebookGrid } from './GatewayLorebooksTab';
import { GatewayScenesTab, SceneGrid } from './GatewayScenesTab';

export type WorldFilter = 'worlds' | 'characters' | 'scenes' | 'lorebooks';

/**
 * Curated characters, stage scenarios and world lorebooks in one tab. Most of them belong to a
 * story collection, so the overview shows the collections; the filters list one kind on its own.
 */
export const WorldsTab = ({ filter }: { filter: WorldFilter }) => {
  if (filter === 'characters') return <GatewayCharactersTab />;
  if (filter === 'scenes') return <GatewayScenesTab />;
  if (filter === 'lorebooks') return <GatewayLorebooksTab />;
  return <WorldsOverview />;
};

/** Loads again the lists of the overview that failed. */
const retryFailed = () => {
  const s = useHubStore.getState();
  if (s.collections.error) void s.loadCollections();
  if (s.gateway.error) void s.loadGateway();
  if (s.scenes.error) void s.loadScenes();
  if (s.lorebooks.error) void s.loadLorebooks();
};

/** Collections first, then the entries that belong to none, grouped by kind. */
const WorldsOverview = () => {
  const { t, currentLanguage } = useTranslation();
  const lists = useCollectionLists();
  const { collections, gateway, lorebooks, scenes, installed } = lists;
  const { query, ensureLoaded, collectionsList, gatewayList, scenesList, lorebooksList } = useHubStore(
    useShallow((s) => ({
      query: s.query,
      ensureLoaded: s.ensureLoaded,
      collectionsList: s.collections,
      gatewayList: s.gateway,
      scenesList: s.scenes,
      lorebooksList: s.lorebooks,
    }))
  );
  const remote: RemoteList<unknown>[] = [collectionsList, gatewayList, scenesList, lorebooksList];
  // Entries outside every collection show here too, so all lists are needed even without collections.
  useEffect(() => {
    ensureLoaded('gateway');
    ensureLoaded('scenes');
    ensureLoaded('lorebooks');
  }, [ensureLoaded]);
  const index = useCollectionIndex();

  const { groups, chars, sceneRest, lorebookRest } = useMemo(() => {
    const visibleChars = gateway.filter((c) => characterMatches(c, query));
    const visibleScenes = scenes.filter((sc) => sceneMatches(sc, query, currentLanguage));
    const visibleLorebooks = lorebooks.filter((lb) => lorebookMatches(lb, query, currentLanguage));
    const membersOf = (c: (typeof collections)[number]): object[] => {
      const m = collectionMembers(c, { gateway, lorebooks, scenes });
      return [...m.characters, ...m.scenes, ...m.lorebooks];
    };
    return {
      groups: groupByCollection<object>(collections, membersOf, [...visibleChars, ...visibleScenes, ...visibleLorebooks], query, currentLanguage).groups,
      chars: visibleChars.filter((c) => !index.has(c)),
      sceneRest: visibleScenes.filter((sc) => !index.has(sc)),
      lorebookRest: visibleLorebooks.filter((lb) => !index.has(lb)),
    };
  }, [collections, gateway, scenes, lorebooks, query, currentLanguage, index]);

  const outdated = useMemo(
    () => ({
      characters: gateway.filter((c) => hubStatus(installed, 'character', c.name, c.revision) === 'update'),
      scenes: scenes.filter((sc) => hubStatus(installed, 'scene', sceneHubId(sc), sc.revision) === 'update'),
      lorebooks: lorebooks.filter((lb) => hubStatus(installed, 'lorebook', lb.name, lb.revision) === 'update'),
    }),
    [gateway, scenes, lorebooks, installed]
  );
  const updates = useUpdateAll(outdated);

  // One state for the four lists: loading until all answered, an error only when all failed.
  const combined: RemoteList<unknown> = {
    items: remote.flatMap((list) => list.items),
    loading: remote.some((list) => list.loading),
    loaded: remote.every((list) => list.loaded || list.error),
    error: remote.every((list) => list.error) ? (remote.find((list) => list.error)?.error ?? null) : null,
  };
  const singles = chars.length + sceneRest.length + lorebookRest.length;

  return (
    <>
      <UpdateAllBar count={updates.count} busy={updates.busy} onClick={() => void updates.run()} />
      <HubListState
        list={combined}
        visibleCount={groups.length + singles}
        loadingText={t('hub.loadingWorlds')}
        emptyText={t('hub.noWorlds')}
        emptyIcon={Library}
        loadingLayout="cards"
        errorText={(error) => t('hub.loadError', { error })}
        onRetry={retryFailed}
      >
        {groups.length > 0 && (
          <section className="mb-8" data-hub-worlds>
            {singles > 0 && <HubSectionTitle>{t('hub.collections')}</HubSectionTitle>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((collection) => <CollectionCard key={collection.id} collection={collection} />)}
            </div>
          </section>
        )}
        {sceneRest.length > 0 && (
          <section className="mb-8">
            <HubSectionTitle>{t('hub.singleScenes')}</HubSectionTitle>
            <SceneGrid items={sceneRest} />
          </section>
        )}
        {lorebookRest.length > 0 && (
          <section className="mb-8">
            <HubSectionTitle>{t('hub.singleLorebooks')}</HubSectionTitle>
            <LorebookGrid items={lorebookRest} />
          </section>
        )}
        {/* Characters last: their grid is virtualized and counts from its own top. */}
        {chars.length > 0 && (
          <section>
            <HubSectionTitle>{t('hub.singleCharacters')}</HubSectionTitle>
            <GatewayCharacterGrid items={chars} layoutKey={`${groups.length}|${sceneRest.length}|${lorebookRest.length}`} />
          </section>
        )}
      </HubListState>
    </>
  );
};
