import type React from 'react';
import { AlertCircle, Check, Download, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { useTranslation, translate } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import type { ToastAction } from '../ui/feedback';
import type { CharacterImportResult } from '../../types';
import type { HubStatus, RemoteList } from './hubStore';
import { ListSkeleton } from '../ui';

interface ListStateProps {
  list: RemoteList<unknown>;
  /** Number of entries left after filtering; `0` shows the empty state. */
  visibleCount: number;
  loadingText: string;
  emptyText: string;
  emptyIcon: LucideIcon;
  loadingLayout?: 'portrait' | 'cards';
  errorText: (error: string) => string;
  onRetry: () => void;
  children: React.ReactNode;
}

/** Loading, error and empty states shared by all hub tabs; renders `children` otherwise. */
export const HubListState = ({
  list,
  visibleCount,
  loadingText,
  emptyText,
  emptyIcon: EmptyIcon,
  loadingLayout,
  errorText,
  onRetry,
  children,
}: ListStateProps) => {
  const { t } = useTranslation();
  // Not loaded yet counts as loading, so "nothing found" never flashes before the first request.
  // Already loaded entries stay visible while more are loading (Chub pagination).
  const pending = list.loading || (!list.loaded && !list.error);
  if (pending && list.items.length === 0) {
    return <ListSkeleton label={loadingText} layout={loadingLayout} />;
  }
  if (list.error && list.items.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center py-20 text-rose-300 gap-3">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm">{errorText(list.error)}</p>
        <button
          onClick={onRetry}
          className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }
  if (visibleCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
        <EmptyIcon className="w-8 h-8" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return <>{children}</>;
};

interface ImportButtonProps {
  busy: boolean;
  onClick: () => void;
  label: string;
  busyLabel: string;
  className: string;
  iconClass?: string;
  /** `update` shows a refresh icon instead of the download icon. */
  status?: HubStatus;
}

export const ImportButton = ({ busy, onClick, label, busyLabel, className, iconClass = 'w-3.5 h-3.5', status }: ImportButtonProps) => (
  <button
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    disabled={busy}
    aria-busy={busy}
    className={className}
  >
    {busy ? (
      <Loader2 className={`${iconClass} animate-spin`} />
    ) : status === 'update' ? (
      <RefreshCw className={iconClass} />
    ) : (
      <Download className={iconClass} />
    )}
    <span>{busy ? busyLabel : label}</span>
  </button>
);

/**
 * Refreshes the library after a character import and builds the success toast with an
 * "open in chat" action.
 */
export const characterImported = async (
  res: CharacterImportResult,
  actionKey: 'hub.openInChat' | 'hub.chatNow' = 'hub.openInChat'
): Promise<{ message: string; action: ToastAction }> => {
  const app = useAppStore.getState();
  await app.refreshCharacters();
  if (res.imported_lorebook) await app.refreshLorebooks();
  const name = res.profile.card.data.name;
  return {
    message: res.imported_lorebook
      ? translate('hub.importedCharLorebook', { name, lorebook: res.imported_lorebook })
      : translate('hub.importedChar', { name }),
    action: {
      label: translate(actionKey),
      onClick: async () => {
        await useAppStore.getState().selectCharacter(res.profile);
        useAppStore.getState().setActiveTab('chat');
      },
    },
  };
};

/** Label of the install button for a status: install, update, or load again. */
export const hubButtonLabel = (status: HubStatus, installLabel: string) =>
  status === 'update' ? translate('hub.update') : status === 'current' ? translate('hub.reinstall') : installLabel;

/** Marks adult content in the hub lists (only shown at all with NSFW on). */
export const NsfwBadge = ({ nsfw }: { nsfw?: boolean }) => {
  const { t } = useTranslation();
  if (!nsfw) return null;
  return (
    <span data-nsfw title={t('nsfw.badgeTitle')}
      className="ml-1 inline-flex items-center rounded-full border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-200">
      18+
    </span>
  );
};

/** "Installed" or "Update available" on a hub entry (nothing for entries not installed). */
export const HubStatusBadge = ({ status, updated }: { status: HubStatus; updated?: string }) => {
  const { t } = useTranslation();
  if (status === 'new') return null;
  return status === 'update' ? (
    <span
      data-hub-status="update"
      title={updated ? t('hub.updatedOn', { date: updated }) : undefined}
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-200"
    >
      <RefreshCw className="w-3 h-3" />
      {t('hub.updateAvailable')}
    </span>
  ) : (
    <span
      data-hub-status="current"
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200"
    >
      <Check className="w-3 h-3" />
      {t('hub.installed')}
    </span>
  );
};

/** Bar above a hub list when installed entries have newer revisions. */
export const UpdateAllBar = ({ count, busy, onClick }: { count: number; busy: boolean; onClick: () => void }) => {
  const { tPlural } = useTranslation();
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3" data-hub-updates={count}>
      <p className="text-sm text-sky-100">{tPlural('hub.updatesAvailable', count)}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        {translate('hub.updateAll')}
      </button>
    </div>
  );
};
