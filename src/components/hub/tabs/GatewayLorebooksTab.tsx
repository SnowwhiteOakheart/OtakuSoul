import { registryText } from '../registryText';
import { memo, useEffect, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../../i18n';
import { hubStatus, useHubStore } from '../hubStore';
import { HubListState, HubStatusBadge, NsfwBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { importLorebookTask } from '../hubInstall';
import { useUpdateAll } from '../hubUpdates';
import { CollectionLink, lorebookMatches, useCollectionIndex } from '../collections';
import type { GatewayCollectionEntry, GatewayLorebookEntry } from '../../../types';

/** All world lorebooks from the gateway registry, each with the collection it belongs to. */
export const GatewayLorebooksTab = () => {
  const { t, currentLanguage } = useTranslation();
  const { list, query, ensureLoaded, load, installed } = useHubStore(
    useShallow((s) => ({ list: s.lorebooks, query: s.query, ensureLoaded: s.ensureLoaded, load: s.loadLorebooks, installed: s.installed }))
  );
  useEffect(() => ensureLoaded('lorebooks'), [ensureLoaded]);
  const index = useCollectionIndex();

  const visible = list.items.filter((lb) => lorebookMatches(lb, query, currentLanguage));
  const outdated = useMemo(() => list.items.filter((lb) => hubStatus(installed, 'lorebook', lb.name, lb.revision) === 'update'), [list.items, installed]);
  const updates = useUpdateAll({ lorebooks: outdated });

  return (
    <>
      <UpdateAllBar count={updates.count} busy={updates.busy} onClick={() => void updates.run()} />
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
        <LorebookGrid items={visible} collectionOf={(lb) => index.get(lb)} />
      </HubListState>
    </>
  );
};

export const LorebookGrid = ({ items, collectionOf }: {
  items: GatewayLorebookEntry[];
  collectionOf?: (lb: GatewayLorebookEntry) => GatewayCollectionEntry | undefined;
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {items.map((lb) => (
      <LorebookCard key={`${lb.name}|${lb.nsfw}`} lb={lb} collection={collectionOf?.(lb)} />
    ))}
  </div>
);

/** One world lorebook with its install button. */
const LorebookCard = memo(({ lb, collection }: { lb: GatewayLorebookEntry; collection?: GatewayCollectionEntry }) => {
  const { t, tPlural, currentLanguage } = useTranslation();
  const text = (field: 'name' | 'description') => registryText(lb, field, lb[field], currentLanguage);
  const { busy, status, runImport } = useHubStore(
    useShallow((s) => ({
      busy: s.importingId === lb.name,
      status: hubStatus(s.installed, 'lorebook', lb.name, lb.revision),
      runImport: s.runImport,
    }))
  );
  return (
    <div className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/50 transition-all p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">{text('name')}</h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-medium shrink-0">
            {tPlural('hub.entryCount', lb.entry_count)}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <HubStatusBadge status={status} updated={lb.updated} />
          <NsfwBadge nsfw={lb.nsfw} />
          <CollectionLink collection={collection} />
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">{text('description') || t('hub.noDescription')}</p>
        <div className="text-xs text-slate-400">
          {t('hub.author')}: <span className="text-slate-300">{lb.author}</span>
        </div>
      </div>
      <ImportButton
        busy={busy}
        onClick={() => void runImport(lb.name, () => importLorebookTask(lb, status))}
        label={hubButtonLabel(status, t('hub.importLorebook'))}
        status={status}
        busyLabel={t('hub.importingLorebook')}
        className="mt-4 w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
      />
    </div>
  );
});
