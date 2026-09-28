import type React from 'react';
import { AlertCircle, Download, Loader2, type LucideIcon } from 'lucide-react';
import { useTranslation, translate } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import type { ToastAction } from '../ui/feedback';
import type { CharacterImportResult } from '../../types';
import type { RemoteList } from './hubStore';

interface ListStateProps {
  list: RemoteList<unknown>;
  /** Number of entries left after filtering; `0` shows the empty state. */
  visibleCount: number;
  loadingText: string;
  emptyText: string;
  emptyIcon: LucideIcon;
  /** Tailwind text color for the spinner, matching the tab's accent. */
  spinnerClass: string;
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
  spinnerClass,
  errorText,
  onRetry,
  children,
}: ListStateProps) => {
  const { t } = useTranslation();
  // Not loaded yet counts as loading, so "nothing found" never flashes before the first request.
  // Already loaded entries stay visible while more are loading (Chub pagination).
  const pending = list.loading || (!list.loaded && !list.error);
  if (pending && list.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <Loader2 className={`w-8 h-8 animate-spin ${spinnerClass}`} />
        <p className="text-sm">{loadingText}</p>
      </div>
    );
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
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
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
}

export const ImportButton = ({ busy, onClick, label, busyLabel, className, iconClass = 'w-3.5 h-3.5' }: ImportButtonProps) => (
  <button
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    disabled={busy}
    aria-busy={busy}
    className={className}
  >
    {busy ? <Loader2 className={`${iconClass} animate-spin`} /> : <Download className={iconClass} />}
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
