import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridCols } from '../../../hooks/useGridCols';
import { Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { translate, useTranslation } from '../../../i18n';
import { hubStatus, matchesQuery, useHubStore, type HubStatus } from '../hubStore';
import { HubListState, HubStatusBadge, NsfwBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { useAppStore } from '../../../store/useAppStore';
import { importCharacterTask, installCharacter } from '../hubInstall';
import { CollectionCard, HubSectionTitle, collectionMembers, groupByCollection, useCollectionLists } from '../collections';
import type { GatewayCharacterEntry, InstalledHubItem } from '../../../types';
import { useScrollMargin } from '../../../hooks/useScrollMargin';

const GRID_BREAKPOINTS = { 640: 3, 768: 4, 1024: 5, 1280: 6 };

/** Curated characters from the Soul Gateway registry. */
export const GatewayCharactersTab = () => {
  const { t, tPlural, currentLanguage } = useTranslation();
  const { list, query, importingId, ensureLoaded, load, runImport, installed, loadInstalled } = useHubStore(
    useShallow((s) => ({ list: s.gateway, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadGateway, runImport: s.runImport, installed: s.installed, loadInstalled: s.loadInstalled }))
  );
  const [updatingAll, setUpdatingAll] = useState(false);
  const statusOf = (char: GatewayCharacterEntry) => hubStatus(installed, 'character', char.name, char.revision);

  useEffect(() => ensureLoaded('gateway'), [ensureLoaded]);

  // Characters of a story collection show as its card; the grid holds the others.
  const lists = useCollectionLists();
  const { collections, gateway, lorebooks, scenes } = lists;
  const { groups, rest } = useMemo(() => {
    const visible = list.items.filter((c) => matchesQuery(query, c.name, c.author));
    return groupByCollection(collections, (c) => collectionMembers(c, { gateway, lorebooks, scenes }).characters, visible, query, currentLanguage);
  }, [list.items, query, currentLanguage, collections, gateway, lorebooks, scenes]);



  const handleImport = (char: GatewayCharacterEntry) => runImport(char.name, () => importCharacterTask(char, statusOf(char)));

  const outdated = useMemo(() => list.items.filter((char) => hubStatus(installed, 'character', char.name, char.revision) === 'update'), [list.items, installed]);
  const updateAll = async () => {
    setUpdatingAll(true);
    let done = 0;
    for (const char of outdated) {
      try {
        await installCharacter(char, 'update');
        done += 1;
      } catch (e) {
        toast.error(translate('hub.importFailed', { error: `${char.name}: ${errorMessage(e)}` }));
      }
    }
    await useAppStore.getState().refreshCharacters();
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
      loadingText={t('hub.loadingGateway')}
      emptyText={t('hub.noResults')}
      emptyIcon={Users}
      loadingLayout="portrait"
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
      {groups.length > 0 && rest.length > 0 && <HubSectionTitle>{t('hub.singleCharacters')}</HubSectionTitle>}
      <GatewayCharacterGrid items={rest} importingId={importingId} installed={installed} onImport={handleImport} hasGroups={groups.length > 0} />
    </HubListState>
    </>
  );
};


/** Scroll updates stay inside the virtual grid, away from the collection gallery. */
const GatewayCharacterGrid = ({ items, importingId, installed, onImport, hasGroups }: {
  items: GatewayCharacterEntry[];
  importingId: string | null;
  installed: InstalledHubItem[];
  onImport: (character: GatewayCharacterEntry) => Promise<unknown>;
  hasGroups: boolean;
}) => {
  const { ref: gridRef, cols } = useGridCols(GRID_BREAKPOINTS, 2);
  // The collection cards above the grid push it down: the virtualizer counts from the grid's top.
  const scrollMargin = useScrollMargin('hub-tabpanel', gridRef, `${hasGroups}|${items.length > 0}`);
  // The virtualizer renders on every scroll event: cards only render again when their own data changes.
  const importRef = useRef(onImport);
  importRef.current = onImport;
  const handleImport = useCallback((char: GatewayCharacterEntry) => void importRef.current(char), []);
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / cols),
    getScrollElement: () => document.getElementById('hub-tabpanel'),
    estimateSize: () => 360,
    // Rows (and their pictures) are ready a few rows before they scroll into view.
    overscan: 3,
    scrollMargin,
  });

  return (
      <div ref={gridRef} style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative', overflowAnchor: 'none' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * cols;
          const rowItems = items.slice(startIndex, startIndex + cols);

          return (
            <div
              key={virtualRow.index}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="grid gap-4"
              style={{
                // Use the same column count for layout and virtual row slicing.
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                paddingBottom: '16px',
              }}
            >
              {rowItems.map((char) => (
                <GatewayCharacterCard
                  key={char.name}
                  char={char}
                  status={hubStatus(installed, 'character', char.name, char.revision)}
                  busy={importingId === char.name}
                  onImport={handleImport}
                />
              ))}
            </div>
          );
        })}
      </div>
  );
};

/** One character in the grid; no hover zoom so cards passing under the pointer stay cheap. */
const GatewayCharacterCard = memo(({ char, status, busy, onImport }: {
  char: GatewayCharacterEntry;
  status: HubStatus;
  busy: boolean;
  onImport: (character: GatewayCharacterEntry) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      data-hub-character
      className="group relative rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-accent-500/50 transition-colors p-3 flex flex-col justify-between overflow-hidden shadow-sm"
    >
      <div>
        <div className="aspect-[3/4] w-full rounded-xl bg-app overflow-hidden relative mb-2.5 border border-slate-800">
          {/* No `loading="lazy"`: the virtualizer already limits the rows, and lazy loading
              would start the download only shortly before the picture becomes visible. */}
          <img src={char.download_url} alt={char.name} decoding="async" draggable={false} className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 text-[11px] text-accent-300 font-mono border border-white/10">
            {char.author}
          </div>
        </div>
        <div className="mb-1">
          <HubStatusBadge status={status} updated={char.updated} />
          <NsfwBadge nsfw={char.nsfw} />
        </div>
        <h3 className="font-bold text-xs text-slate-100 truncate" title={char.name}>
          {char.name}
        </h3>
        <p className="text-xs text-slate-400 truncate">
          {t('hub.creator')}: <span className="text-accent-300">{char.author}</span>
        </p>
      </div>
      <ImportButton
        busy={busy}
        onClick={() => onImport(char)}
        label={hubButtonLabel(status, t('hub.import'))}
        status={status}
        busyLabel={t('hub.importing')}
        className="mt-3 w-full py-1.5 px-3 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:bg-accent-900/50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
      />
    </div>
  );
});
