import { useEffect, type ReactNode } from 'react';
import { BookOpen, Dice5, Users } from 'lucide-react';
import { CoverCard, CoverCount } from '../ui/CoverCard';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../i18n';
import { hubStatus, matchesQuery, useHubStore, type HubKind, type HubStatus } from './hubStore';
import { HubStatusBadge, NsfwBadge } from './hubParts';
import { sceneHubId } from './hubInstall';
import { registryText } from './registryText';
import type {
  GatewayCharacterEntry,
  GatewayCollectionEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
  InstalledHubItem,
} from '../../types';

/** The hub entries a collection lists, as far as the loaded registries have them. */
export interface CollectionMembers {
  lorebooks: GatewayLorebookEntry[];
  scenes: GatewaySceneEntry[];
  characters: GatewayCharacterEntry[];
}

/**
 * The entry for each key. Both repositories can have an entry of the same name (e.g. a character
 * in a general and an adult version); a collection takes the one from its own repository.
 */
const pick = <T extends { nsfw: boolean },>(keys: string[], items: T[], keyOf: (item: T) => string, nsfw: boolean): T[] =>
  keys.flatMap((key) => {
    const matches = items.filter((item) => keyOf(item) === key);
    const own = matches.find((item) => item.nsfw === nsfw) ?? matches[0];
    return own ? [own] : [];
  });

export const collectionMembers = (
  collection: GatewayCollectionEntry,
  lists: { lorebooks: GatewayLorebookEntry[]; scenes: GatewaySceneEntry[]; gateway: GatewayCharacterEntry[] }
): CollectionMembers => ({
  lorebooks: pick(collection.lorebooks, lists.lorebooks, (lb) => lb.name, collection.nsfw),
  scenes: pick(collection.scenes, lists.scenes, sceneHubId, collection.nsfw),
  characters: pick(collection.characters, lists.gateway, (c) => c.name, collection.nsfw),
});

/** One member with its kind and install status. */
export type CollectionItem =
  | { kind: 'lorebook'; key: string; entry: GatewayLorebookEntry; status: HubStatus }
  | { kind: 'scene'; key: string; entry: GatewaySceneEntry; status: HubStatus }
  | { kind: 'character'; key: string; entry: GatewayCharacterEntry; status: HubStatus };

/**
 * All members with their status, in install order: characters first (scenes cast them by name),
 * then lorebooks, then scenes.
 */
export const collectionItems = (members: CollectionMembers, installed: InstalledHubItem[]): CollectionItem[] => {
  const status = (kind: HubKind, key: string, revision: number) => hubStatus(installed, kind, key, revision);
  return [
    ...members.characters.map((entry) => ({ kind: 'character' as const, key: entry.name, entry, status: status('character', entry.name, entry.revision) })),
    ...members.lorebooks.map((entry) => ({ kind: 'lorebook' as const, key: entry.name, entry, status: status('lorebook', entry.name, entry.revision) })),
    ...members.scenes.map((entry) => ({ kind: 'scene' as const, key: sceneHubId(entry), entry, status: status('scene', sceneHubId(entry), entry.revision) })),
  ];
};

/** `update` if any member has a newer revision, `current` if all are installed, else `new`. */
export const collectionStatus = (items: CollectionItem[]): HubStatus =>
  items.some((item) => item.status === 'update')
    ? 'update'
    : items.length > 0 && items.every((item) => item.status === 'current')
      ? 'current'
      : 'new';

export const collectionText = (collection: GatewayCollectionEntry, field: 'title' | 'description', lang: string) =>
  registryText(collection, field, collection[field], lang);

/**
 * Splits a hub list into collection cards and the entries that belong to none. `membersOf` gives
 * a collection's entries of this list; a collection shows when it has some, with a search only
 * when its own texts or a member match.
 */
export function groupByCollection<T>(
  collections: GatewayCollectionEntry[],
  membersOf: (collection: GatewayCollectionEntry) => T[],
  visible: T[],
  query: string,
  lang: string
): { groups: GatewayCollectionEntry[]; rest: T[] } {
  const shown = new Set(visible);
  const withMembers = collections.map((c) => ({ c, members: membersOf(c) })).filter(({ members }) => members.length > 0);
  const grouped = new Set(withMembers.flatMap(({ members }) => members));
  const groups = withMembers
    .filter(
      ({ c, members }) =>
        members.some((m) => shown.has(m)) ||
        matchesQuery(query, c.title, collectionText(c, 'title', lang), c.description, collectionText(c, 'description', lang))
    )
    .map(({ c }) => c);
  return { groups, rest: visible.filter((item) => !grouped.has(item)) };
}

/** Loads everything a collection card needs to show its status. */
export const useCollectionLists = () => {
  const state = useHubStore(
    useShallow((s) => ({
      collections: s.collections.items,
      lorebooks: s.lorebooks.items,
      scenes: s.scenes.items,
      gateway: s.gateway.items,
      installed: s.installed,
      ensureLoaded: s.ensureLoaded,
    }))
  );
  const { ensureLoaded } = state;
  useEffect(() => ensureLoaded('collections'), [ensureLoaded]);
  // Members of the other kinds are only needed once there are collections at all.
  const hasCollections = state.collections.length > 0;
  useEffect(() => {
    if (!hasCollections) return;
    ensureLoaded('gateway');
    ensureLoaded('lorebooks');
    ensureLoaded('scenes');
  }, [hasCollections, ensureLoaded]);
  return state;
};

/** Cover card of a story collection; opens the detail dialog. */
export const CollectionCard = ({ collection }: { collection: GatewayCollectionEntry }) => {
  const { t, currentLanguage } = useTranslation();
  const lists = useCollectionLists();
  const setOpenCollection = useHubStore((s) => s.setOpenCollection);
  const items = collectionItems(collectionMembers(collection, lists), lists.installed);
  const status = collectionStatus(items);
  const installedCount = items.filter((item) => item.status !== 'new').length;
  const title = collectionText(collection, 'title', currentLanguage);

  return (
    <CoverCard
      data-hub-collection={collection.id}
      onClick={() => setOpenCollection(collection.id)}
      aria-label={t('hub.collectionOpen', { name: title })}
      cover={collection.cover_url}
      title={title}
      label={t('hub.collection')}
      description={collectionText(collection, 'description', currentLanguage) || t('hub.noDescription')}
      chips={
        <>
          <CoverCount icon={BookOpen} count={collection.lorebooks.length} label={t('hub.tabLorebooks')} className="text-amber-400" />
          <CoverCount icon={Dice5} count={collection.scenes.length} label={t('hub.tabScenes')} className="text-emerald-400" />
          <CoverCount icon={Users} count={collection.characters.length} label={t('hub.collectionCharacters')} className="text-accent-400" />
        </>
      }
      status={
        <>
          {status === 'new' && installedCount > 0 ? (
            <span className="text-[11px] text-slate-400">{t('hub.collectionPartly', { installed: installedCount, total: items.length })}</span>
          ) : (
            <HubStatusBadge status={status} updated={collection.updated} />
          )}
          <NsfwBadge nsfw={collection.nsfw} />
        </>
      }
    />
  );
};

/** Section heading above collection cards or single entries. */
export const HubSectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{children}</h2>
);
