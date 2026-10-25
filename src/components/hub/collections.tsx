import { useEffect, type ReactNode } from 'react';
import { BookOpen, Dice5, Library, Users } from 'lucide-react';
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

const pick = <T,>(keys: string[], items: T[], keyOf: (item: T) => string): T[] =>
  keys.flatMap((key) => items.filter((item) => keyOf(item) === key).slice(0, 1));

export const collectionMembers = (
  collection: GatewayCollectionEntry,
  lists: { lorebooks: GatewayLorebookEntry[]; scenes: GatewaySceneEntry[]; gateway: GatewayCharacterEntry[] }
): CollectionMembers => ({
  lorebooks: pick(collection.lorebooks, lists.lorebooks, (lb) => lb.name),
  scenes: pick(collection.scenes, lists.scenes, sceneHubId),
  characters: pick(collection.characters, lists.gateway, (c) => c.name),
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
 * Splits a hub list into collection cards and the entries that belong to none. A collection shows
 * when it has members in `all`; with a search it needs a match in its own texts or in a member.
 */
export function groupByCollection<T>(
  collections: GatewayCollectionEntry[],
  keysOf: (collection: GatewayCollectionEntry) => string[],
  all: T[],
  visible: T[],
  keyOf: (item: T) => string,
  query: string,
  lang: string
): { groups: GatewayCollectionEntry[]; rest: T[] } {
  const present = new Set(all.map(keyOf));
  const visibleKeys = new Set(visible.map(keyOf));
  const withMembers = collections.filter((c) => keysOf(c).some((key) => present.has(key)));
  const grouped = new Set(withMembers.flatMap(keysOf));
  const groups = withMembers.filter(
    (c) =>
      keysOf(c).some((key) => visibleKeys.has(key)) ||
      matchesQuery(query, c.title, collectionText(c, 'title', lang), c.description, collectionText(c, 'description', lang))
  );
  return { groups, rest: visible.filter((item) => !grouped.has(keyOf(item))) };
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

/** Small icon + number, e.g. "📖 3". */
const Count = ({ icon: Icon, count, label, className }: { icon: typeof BookOpen; count: number; label: string; className: string }) =>
  count > 0 ? (
    <span title={label} className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 text-[11px] font-mono text-slate-300">
      <Icon className={`w-3 h-3 ${className}`} />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  ) : null;

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
    <button
      type="button"
      data-hub-collection={collection.id}
      onClick={() => setOpenCollection(collection.id)}
      aria-label={t('hub.collectionOpen', { name: title })}
      className="group text-left rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-accent-500/60 transition-all overflow-hidden flex flex-col shadow-sm hover:shadow-accent-950/30 outline-hidden focus-visible:border-accent-400"
    >
      <div className="relative aspect-video w-full bg-app overflow-hidden">
        {collection.cover_url ? (
          <img
            src={collection.cover_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-accent-900/60 via-slate-900 to-slate-950 flex items-center justify-center">
            <Library className="w-10 h-10 text-accent-400/60" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/95 via-slate-950/30 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-accent-200 border border-white/10">
          <Library className="w-3 h-3" />
          {t('hub.collection')}
        </span>
        <h3 className="absolute bottom-2.5 left-3 right-3 font-bold text-base text-white drop-shadow-md group-hover:text-accent-200 transition-colors">
          {title}
        </h3>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Count icon={BookOpen} count={collection.lorebooks.length} label={t('hub.tabLorebooks')} className="text-amber-400" />
          <Count icon={Dice5} count={collection.scenes.length} label={t('hub.tabScenes')} className="text-emerald-400" />
          <Count icon={Users} count={collection.characters.length} label={t('hub.collectionCharacters')} className="text-accent-400" />
          <span className="ml-auto">
            {status === 'new' && installedCount > 0 ? (
              <span className="text-[11px] text-slate-400">{t('hub.collectionPartly', { installed: installedCount, total: items.length })}</span>
            ) : (
              <HubStatusBadge status={status} updated={collection.updated} />
            )}
            <NsfwBadge nsfw={collection.nsfw} />
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
          {collectionText(collection, 'description', currentLanguage) || t('hub.noDescription')}
        </p>
      </div>
    </button>
  );
};

/** Section heading above collection cards or single entries. */
export const HubSectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{children}</h2>
);
