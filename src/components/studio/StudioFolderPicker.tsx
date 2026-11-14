import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import type { StudioFolder, StudioKind } from '../../types';

interface StudioFolderPickerProps {
  kind: StudioKind;
  /** The folder changed: the studio reads its file list again. */
  onChanged: () => void;
}

/** Where a studio saves: the folder, "choose …" and back to the default (music/pictures). */
export const StudioFolderPicker = ({ kind, onChanged }: StudioFolderPickerProps) => {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<StudioFolder | null>(null);

  useEffect(() => {
    void api.getStudioFolder(kind).then(setFolder).catch(() => setFolder(null));
  }, [kind]);

  const apply = async (path: string | null) => {
    try {
      setFolder(await api.setStudioFolder(kind, path));
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const choose = async () => {
    const picked = await open({ directory: true, defaultPath: folder?.path });
    if (typeof picked === 'string') await apply(picked);
  };

  return (
    <div className="space-y-1.5">
      <p className="block text-xs font-semibold text-slate-300">{t('studio.folder')}</p>
      <p className="break-all rounded-lg bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-slate-300" data-testid="studio-folder">
        {folder?.path ?? '…'}
        {folder?.is_default && <span className="ml-2 font-sans text-slate-500">({t('studio.folderDefault')})</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void choose()} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
          <FolderOpen className="w-3.5 h-3.5" /> {t('studio.folderChoose')}
        </button>
        {folder && !folder.is_default && (
          <button type="button" onClick={() => void apply(null)} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
            <RotateCcw className="w-3.5 h-3.5" /> {t('studio.folderReset')}
          </button>
        )}
      </div>
    </div>
  );
};
