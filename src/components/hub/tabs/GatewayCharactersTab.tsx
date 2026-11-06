import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridCols } from '../../../hooks/useGridCols';
import { Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../../i18n';
import { hubStatus, useHubStore, type HubStatus } from '../hubStore';
import { HubListState, HubStatusBadge, NsfwBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { importCharacterTask } from '../hubInstall';
import { useUpdateAll } from '../hubUpdates';
import { CollectionLink, characterMatches, useCollectionIndex } from '../collections';
import type { GatewayCharacterEntry, GatewayCollectionEntry } from '../../../types';
import { useScrollMargin } from '../../../hooks/useScrollMargin';

const GRID_BREAKPOINTS = { 640: 3, 768: 4, 1024: 5, 1280: 6 };

/** All curated characters from the Soul Gateway registry, each with the collection it belongs to. */
export const GatewayCharactersTab = () => {
  const { t } = useTranslation();
  const { list, query, ensureLoaded, load, installed } = useHubStore(
    useShallow((s) => ({ list: s.gateway, query: s.query, ensureLoaded: s.ensureLoaded, load: s.loadGateway, installed: s.installed }))
  );
  useEffect(() => ensureLoaded('gateway'), [ensureLoaded]);
  const index = useCollectionIndex();

  const visible = useMemo(() => list.items.filter((c) => characterMatches(c, query)), [list.items, query]);
  const outdated = useMemo(() => list.items.filter((char) => hubStatus(installed, 'character', char.name, char.revision) === 'update'), [list.items, installed]);
  const updates = useUpdateAll({ characters: outdated });

  return (
    <>
    <UpdateAllBar count={updates.count} busy={updates.busy} onClick={() => void updates.run()} />
    <HubListState
      list={list}
      visibleCount={visible.length}
      loadingText={t('hub.loadingGateway')}
      emptyText={t('hub.noResults')}
      emptyIcon={Users}
      loadingLayout="portrait"
      errorText={(error) => t('hub.loadError', { error })}
      onRetry={load}
    >
      <GatewayCharacterGrid items={visible} collectionOf={(char) => index.get(char)} />
    </HubListState>
    </>
  );
};


/** Scroll updates stay inside the virtual grid, away from the collection gallery. */
export const GatewayCharacterGrid = ({ items, collectionOf, layoutKey = '' }: {
  items: GatewayCharacterEntry[];
  collectionOf?: (char: GatewayCharacterEntry) => GatewayCollectionEntry | undefined;
  /** Changes when content above the grid appears or goes. */
  layoutKey?: string;
}) => {
  const { importingId, installed, runImport } = useHubStore(
    useShallow((s) => ({ importingId: s.importingId, installed: s.installed, runImport: s.runImport }))
  );
  const { ref: gridRef, cols } = useGridCols(GRID_BREAKPOINTS, 2);
  // The collection cards above the grid push it down: the virtualizer counts from the grid's top.
  const scrollMargin = useScrollMargin('hub-tabpanel', gridRef, `${layoutKey}|${items.length > 0}`);
  // The virtualizer renders on every scroll event: cards only render again when their own data changes.
  const onImport = (char: GatewayCharacterEntry) =>
    runImport(char.name, () => importCharacterTask(char, hubStatus(installed, 'character', char.name, char.revision)));
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
                  key={`${char.name}|${char.nsfw}`}
                  char={char}
                  collection={collectionOf?.(char)}
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
const GatewayCharacterCard = memo(({ char, collection, status, busy, onImport }: {
  char: GatewayCharacterEntry;
  collection?: GatewayCollectionEntry;
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
        {collection && (
          <div className="mb-1">
            <CollectionLink collection={collection} />
          </div>
        )}
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
