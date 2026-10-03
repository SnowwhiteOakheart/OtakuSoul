import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import { confirmDialog, toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { Plus, FolderDown, RotateCcw } from 'lucide-react';

export const MemoryBackupsTab = () => {
  const { t } = useTranslation();
  const {
    memoryBackups, isLoadingBackups, createMemoryBackup, restoreMemoryBackup, importSowFolder,
  } = useStoreFields(
    'memoryBackups', 'isLoadingBackups', 'createMemoryBackup', 'restoreMemoryBackup',
    'importSowFolder',
  );

  const handleImportSow = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: translate('memory.sowDialogTitle'),
      });
      if (selected && typeof selected === 'string') {
        const count = await importSowFolder(selected);
        toast.success(translate('memory.sowImported', { count }));
      }
    } catch (e) {
      toast.error(translate('memory.importFailed', { error: errorMessage(e) }));
    }
  };

  const handleCreateBackup = async () => {
    const b = await createMemoryBackup();
    if (b) {
      toast.success(translate('memory.snapshotCreated', { name: b.filename }));
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.restoreSnapshotTitle', { name: filename }),
      message: translate('confirm.restoreSnapshotText'),
      confirmLabel: translate('confirm.restore'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const b = memoryBackups.find((m) => m.filename === filename);
      if (!b) return;
      // We pass the filename or character backup path
      await restoreMemoryBackup(filename);
      toast.success(translate('memory.snapshotRestored', { name: filename }));
    } catch (e) {
      toast.error(translate('memory.restoreFailed', { error: errorMessage(e) }));
    }
  };

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60">
          <div>
            <h3 className="text-xs font-bold text-slate-200">{t('memory.sowTitle')}</h3>
            <p className="text-xs text-slate-400">{t('memory.sowText')}</p>
          </div>
          <button
            onClick={handleImportSow}
            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <FolderDown className="w-3.5 h-3.5" />
            {t('memory.sowPick')}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            {t('memory.snapshots', { count: memoryBackups.length })}
          </span>
          <button
            onClick={handleCreateBackup}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('memory.createSnapshot')}
          </button>
        </div>

        <div className="space-y-2">
          {memoryBackups.map((b) => (
            <div
              key={b.filename}
              className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs"
            >
              <div>
                <div className="font-semibold text-slate-200 font-mono text-xs">
                  {b.filename}
                </div>
                <div className="text-slate-400 text-[11px]">
                  {b.date_formatted} • {Math.round(b.size_bytes / 1024)} KB
                </div>
              </div>
              <button
                onClick={() => handleRestoreBackup(b.filename)}
                className="px-2.5 py-1 rounded bg-slate-700 hover:bg-accent-600 text-slate-200 text-xs font-medium transition flex items-center gap-1"
                title={t('memory.restoreSnapshot')}
              >
                <RotateCcw className="w-3 h-3" />
                {t('memory.restore')}
              </button>
            </div>
          ))}

          {memoryBackups.length === 0 && !isLoadingBackups && (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              {t('memory.noSnapshots')}
            </div>
          )}
        </div>
      </div>
  );
};
