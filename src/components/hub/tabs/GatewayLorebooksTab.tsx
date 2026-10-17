import { registryText } from '../registryText';
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { hubStatus, matchesQuery, useHubStore } from '../hubStore';
import { HubListState, HubStatusBadge, ImportButton, UpdateAllBar, hubButtonLabel } from '../hubParts';
import { confirmDialog, toast } from '../../ui/feedback';
import { errorCode, errorMessage } from '../../../utils/errors';
import type { GatewayLorebookEntry } from '../../../types';

/**
 * Installs or updates a gateway lorebook. When the user changed the installed copy (or has an own
 * lorebook of that name), they decide whether the update goes ahead with their version kept as a
 * copy; `null` = cancelled.
 */
async function installLorebook(lb: GatewayLorebookEntry) {
  const run = (keepCopy: boolean) =>
    api.importLorebookFromGateway(lb.download_url, lb.name, lb.revision, lb.updated, keepCopy);
  try {
    return await run(false);
  } catch (e) {
    if (errorCode(e)?.code !== 'backend.hub.lorebookModified') throw e;
    const confirmed = await confirmDialog({
      title: translate('hub.lorebookModifiedTitle', { name: lb.name }),
      message: translate('hub.lorebookModifiedText'),
      confirmLabel: translate('hub.lorebookKeepCopy'),
    });
    return confirmed ? await run(true) : null;
  }
}

/** World lorebooks from the gateway registry. */
export const GatewayLorebooksTab = () => {
  const { t, tPlural, currentLanguage } = useTranslation();
  const text = (lb: GatewayLorebookEntry, field: 'name' | 'description') => registryText(lb, field, lb[field], currentLanguage);
  const { list, query, importingId, ensureLoaded, load, runImport, installed, loadInstalled } = useHubStore(
    useShallow((s) => ({ list: s.lorebooks, query: s.query, importingId: s.importingId, ensureLoaded: s.ensureLoaded, load: s.loadLorebooks, runImport: s.runImport, installed: s.installed, loadInstalled: s.loadInstalled }))
  );
  const [updatingAll, setUpdatingAll] = useState(false);
  const statusOf = (lb: GatewayLorebookEntry) => hubStatus(installed, 'lorebook', lb.name, lb.revision);

  useEffect(() => ensureLoaded('lorebooks'), [ensureLoaded]);

  const visible = list.items.filter((lb) => matchesQuery(query, lb.name, text(lb, 'name'), lb.description, text(lb, 'description'), lb.author));

  const handleImport = (lb: GatewayLorebookEntry) =>
    runImport(lb.name, async () => {
      const wasInstalled = statusOf(lb) !== 'new';
      const res = await installLorebook(lb);
      await useAppStore.getState().refreshLorebooks();
      if (!res) return null;
      return {
        message: translate(wasInstalled ? 'hub.updatedLorebook' : 'hub.importedLorebook', { name: res.name, count: res.entries.length }),
        action: { label: translate('hub.viewLorebooks'), onClick: () => useAppStore.getState().setActiveTab('lorebooks') },
      };
    });

  const outdated = list.items.filter((lb) => statusOf(lb) === 'update');
  const updateAll = async () => {
    setUpdatingAll(true);
    let done = 0;
    for (const lb of outdated) {
      try {
        if (await installLorebook(lb)) done += 1;
      } catch (e) {
        toast.error(translate('hub.importFailed', { error: `${lb.name}: ${errorMessage(e)}` }));
      }
    }
    await useAppStore.getState().refreshLorebooks();
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
      loadingText={t('hub.loadingLorebooks')}
      emptyText={t('hub.noLorebooks')}
      emptyIcon={BookOpen}
      loadingLayout="cards"
      errorText={(error) => t('hub.loadError', { error })}
      onRetry={load}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((lb) => (
          <div
            key={lb.name}
            className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">{text(lb, 'name')}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-medium shrink-0">
                  {tPlural('hub.entryCount', lb.entry_count)}
                </span>
              </div>
              <div className="mb-2">
                <HubStatusBadge status={statusOf(lb)} updated={lb.updated} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{text(lb, 'description') || t('hub.noDescription')}</p>
              <div className="text-xs text-slate-400">
                {t('hub.author')}: <span className="text-slate-300">{lb.author}</span>
              </div>
            </div>
            <ImportButton
              busy={importingId === lb.name}
              onClick={() => void handleImport(lb)}
              label={hubButtonLabel(statusOf(lb), t('hub.importLorebook'))}
              status={statusOf(lb)}
              busyLabel={t('hub.importingLorebook')}
              className="mt-4 w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/50 text-app font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
            />
          </div>
        ))}
      </div>
    </HubListState>
    </>
  );
};
