import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, Check, Dice5, Library, Loader2, PackageCheck, Users, X } from 'lucide-react';
import { useTranslation, translate } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';
import { HubStatusBadge, ImportButton, NsfwBadge, hubButtonLabel } from './hubParts';
import { useHubStore } from './hubStore';
import {
  importCharacterTask,
  importLorebookTask,
  importSceneTask,
  installCharacter,
  installLorebook,
  installScene,
} from './hubInstall';
import {
  collectionItems,
  collectionMembers,
  collectionStatus,
  collectionText,
  useCollectionLists,
  type CollectionItem,
} from './collections';
import { registryText } from './registryText';

const itemId = (item: CollectionItem) => `${item.kind}:${item.key}`;

/** Installs one member without its own toast; `false` = the user cancelled. */
async function installQuietly(item: CollectionItem): Promise<boolean> {
  switch (item.kind) {
    case 'character':
      return (await installCharacter(item.entry, item.status)) !== null;
    case 'lorebook':
      return (await installLorebook(item.entry)) !== null;
    case 'scene':
      await installScene(item.entry);
      return true;
  }
}

/** Installs one member with the usual success toast. */
const importTask = (item: CollectionItem) => {
  switch (item.kind) {
    case 'character':
      return importCharacterTask(item.entry, item.status);
    case 'lorebook':
      return importLorebookTask(item.entry, item.status);
    case 'scene':
      return importSceneTask(item.entry, item.status);
  }
};

/**
 * A story collection: its lorebooks, scenes and characters, each installable on its own, or all
 * that are missing or outdated at once.
 */
export const CollectionModal = () => {
  const { t, tPlural, currentLanguage } = useTranslation();
  const lists = useCollectionLists();
  const { openCollection, setOpenCollection, importingId, runImport, loadInstalled } = useHubStore(
    useShallow((s) => ({ openCollection: s.openCollection, setOpenCollection: s.setOpenCollection, importingId: s.importingId, runImport: s.runImport, loadInstalled: s.loadInstalled }))
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const collection = lists.collections.find((c) => c.id === openCollection);
  if (!collection) return null;

  const items = collectionItems(collectionMembers(collection, lists), lists.installed);
  const pending = items.filter((item) => item.status !== 'current');
  const status = collectionStatus(items);
  const title = collectionText(collection, 'title', currentLanguage);
  const busy = progress !== null;
  const close = () => {
    if (!busy) setOpenCollection(null);
  };

  const installAll = async () => {
    setProgress({ done: 0, total: pending.length });
    let installed = 0;
    for (const [index, item] of pending.entries()) {
      try {
        if (await installQuietly(item)) installed += 1;
      } catch (e) {
        toast.error(translate('hub.importFailed', { error: `${item.key}: ${errorMessage(e)}` }));
      }
      setProgress({ done: index + 1, total: pending.length });
    }
    const app = useAppStore.getState();
    await Promise.all([app.refreshCharacters(), app.refreshLorebooks(), app.fetchStageScenes(), loadInstalled()]);
    setProgress(null);
    if (installed) {
      const firstScene = items.find((item) => item.kind === 'scene');
      toast.success(
        tPlural('hub.collectionInstalled', installed, { name: title }),
        firstScene ? { label: translate('hub.viewInStage'), onClick: () => useAppStore.getState().setActiveTab('stage') } : undefined
      );
    }
  };

  const section = (kind: CollectionItem['kind']) => items.filter((item) => item.kind === kind);
  const rowButton = (item: CollectionItem, installLabel: string) => (
    <ImportButton
      busy={importingId === itemId(item)}
      onClick={() => {
        if (!busy) void runImport(itemId(item), () => importTask(item));
      }}
      label={hubButtonLabel(item.status, installLabel)}
      status={item.status}
      busyLabel={t('hub.importing')}
      className="shrink-0 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
    />
  );

  const lorebooks = section('lorebook');
  const scenes = section('scene');
  const characters = section('character');

  return (
    <ModalOverlay
      onClose={close}
      closeOnBackdrop
      aria-labelledby="hub-collection-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        data-hub-collection-dialog={collection.id}
        className="w-full max-w-3xl max-h-[90vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
      >
        {/* Cover */}
        <div className={`relative shrink-0 bg-app ${collection.cover_url ? 'h-48 sm:h-56' : 'h-28'}`}>
          {collection.cover_url ? (
            <img src={collection.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-accent-900/60 via-slate-900 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-linear-to-t from-slate-900 via-slate-900/40 to-transparent" />
          <button
            onClick={close}
            disabled={busy}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 text-slate-200 hover:text-white disabled:opacity-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-4">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-200 mb-1">
              <Library className="w-3.5 h-3.5" />
              {t('hub.collection')}
            </span>
            <h2 id="hub-collection-title" className="text-2xl font-bold text-white drop-shadow-md">
              {title}
              <NsfwBadge nsfw={collection.nsfw} />
            </h2>
          </div>
        </div>

        <div className="px-6 pt-2 pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-300 leading-relaxed">{collectionText(collection, 'description', currentLanguage)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {t('hub.author')}: <span className="text-slate-400">{collection.author}</span>
            </p>
          </div>
          <button
            type="button"
            data-hub-install-all
            disabled={busy || pending.length === 0}
            onClick={() => void installAll()}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('hub.collectionInstalling', { done: progress.done, total: progress.total })}
              </>
            ) : status === 'current' ? (
              <>
                <Check className="w-4 h-4" />
                {t('hub.collectionComplete')}
              </>
            ) : (
              <>
                <PackageCheck className="w-4 h-4" />
                {pending.length === items.length
                  ? t('hub.collectionInstallAll')
                  : t('hub.collectionInstallMissing', { count: pending.length })}
              </>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {lorebooks.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2">
                <BookOpen className="w-3.5 h-3.5" />
                {t('hub.tabLorebooks')}
              </h3>
              <ul className="space-y-2">
                {lorebooks.map((item) =>
                  item.kind !== 'lorebook' ? null : (
                    <li key={item.key} className="flex items-center gap-3 rounded-xl bg-slate-950/50 border border-slate-800 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">{registryText(item.entry, 'name', item.entry.name, currentLanguage)}</span>
                          <span className="text-[11px] font-mono text-amber-300/80">{tPlural('hub.entryCount', item.entry.entry_count)}</span>
                          <HubStatusBadge status={item.status} updated={item.entry.updated} />
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {registryText(item.entry, 'description', item.entry.description, currentLanguage)}
                        </p>
                      </div>
                      {rowButton(item, t('hub.install'))}
                    </li>
                  )
                )}
              </ul>
            </section>
          )}

          {scenes.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">
                <Dice5 className="w-3.5 h-3.5" />
                {t('hub.tabScenes')}
              </h3>
              <ul className="space-y-2">
                {scenes.map((item) =>
                  item.kind !== 'scene' ? null : (
                    <li key={item.key} className="flex items-center gap-3 rounded-xl bg-slate-950/50 border border-slate-800 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">{registryText(item.entry, 'title', item.entry.title, currentLanguage)}</span>
                          <HubStatusBadge status={item.status} updated={item.entry.updated} />
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {registryText(item.entry, 'description', item.entry.description, currentLanguage)}
                        </p>
                      </div>
                      {rowButton(item, t('hub.install'))}
                    </li>
                  )
                )}
              </ul>
            </section>
          )}

          {characters.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-300 mb-2">
                <Users className="w-3.5 h-3.5" />
                {t('hub.collectionCharacters')}
              </h3>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {characters.map((item) =>
                  item.kind !== 'character' ? null : (
                    <li key={item.key} className="rounded-xl bg-slate-950/50 border border-slate-800 p-2 flex flex-col gap-2">
                      <div className="aspect-[3/4] w-full rounded-lg overflow-hidden bg-app border border-slate-800">
                        <img src={item.entry.download_url} alt={item.entry.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-slate-100 truncate" title={item.entry.name}>{item.entry.name}</p>
                        <div className="h-5"><HubStatusBadge status={item.status} updated={item.entry.updated} /></div>
                      </div>
                      {rowButton(item, t('hub.install'))}
                    </li>
                  )
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
