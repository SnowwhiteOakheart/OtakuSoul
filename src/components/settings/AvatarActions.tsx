import { forgetAvatar } from '../avatar/avatarCache';
import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { translate, useTranslation } from '../../i18n';
import { api } from '../../services/api';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';

/** How long a removed avatar can be brought back before it goes to the trash. */
export const AVATAR_UNDO_MS = 8000;

export interface AvatarEntry {
  name: string;
  path: string;
  removable: boolean;
}

interface AvatarActionsProps {
  kind: 'vrm' | 'live2d';
  /** The avatar chosen in the list above. */
  entry: AvatarEntry | undefined;
  /** Reloads the list after a rename or removal. */
  refresh: () => Promise<void>;
  /** Hides the avatar at once (and picks another one); `undo` brings it back. */
  hide: (path: string) => void;
  unhide: (path: string) => void;
  /** Opens the name field right away (after an import). */
  startEditing?: boolean;
}

/** Rename and remove for the avatar chosen in a list: names stay in the app, files keep theirs. */
export const AvatarActions = ({ kind, entry, refresh, hide, unhide, startEditing = false }: AvatarActionsProps) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(startEditing && entry ? entry.name : null);
  const [busy, setBusy] = useState(false);

  if (!entry) return null;

  const saveName = async () => {
    if (editing === null) return;
    setBusy(true);
    try {
      await api.renameAvatar(kind, entry.path, editing);
      await refresh();
      setEditing(null);
      if (editing.trim()) toast.success(translate('settings.avatarRenamed', { name: editing.trim() }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Like messages and chats: gone at once, with a few seconds to take it back.
  const remove = () => {
    const { path, name } = entry;
    hide(path);
    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      forgetAvatar(path);
      api
        .deleteAvatar(kind, path)
        .then(refresh)
        .catch((e) => {
          unhide(path);
          toast.error(errorMessage(e));
        });
    }, AVATAR_UNDO_MS);
    toast.info(translate('settings.avatarDeleted', { name }), {
      label: translate('common.undo'),
      onClick: () => {
        undone = true;
        clearTimeout(timer);
        unhide(path);
      },
    });
  };

  if (editing !== null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void saveName();
        }}
      >
        <input
          autoFocus
          value={editing}
          disabled={busy}
          maxLength={80}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
          aria-label={t('settings.avatarRenameLabel', { name: entry.name })}
          placeholder={entry.name}
          className="flex-1 min-w-[200px] bg-app border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-hidden focus:border-accent-500"
          data-avatar-rename={kind}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {t('common.save')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(null)}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          {t('common.cancel')}
        </button>
        <p className="w-full text-[11px] text-slate-500">{t('settings.avatarRenameHint')}</p>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => setEditing(entry.name)}
        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 flex items-center gap-1.5"
        data-avatar-action="rename"
      >
        <Pencil className="w-3.5 h-3.5" />
        {t('settings.avatarRename')}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={!entry.removable}
        title={entry.removable ? undefined : t('settings.avatarDeleteBundled')}
        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:border-rose-500/50 hover:text-rose-200 text-slate-200 flex items-center gap-1.5 disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-200"
        data-avatar-action="delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('settings.avatarDelete')}
      </button>
      {!entry.removable && <span className="text-[11px] text-slate-500">{t('settings.avatarDeleteBundled')}</span>}
    </div>
  );
};
