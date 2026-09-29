import type React from 'react';
import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { confirmDialog, toast } from '../../ui/feedback';
import { backendMessage, errorMessage } from '../../../utils/errors';
import {
  RefreshCw,
  Shield,
  Trash2,
  Download,
  Database,
  Clock,
  BookOpen,
  Bot,
  Brain,
  Settings,
  Swords,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { BackupGroupSelection } from '../../../types';

export const BackupTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    backups, fetchBackups, createBackup, restoreBackup, deleteBackup,
  } = useStoreFields(
    'backups', 'fetchBackups', 'createBackup', 'restoreBackup', 'deleteBackup',
  );

  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');
  const [backupGroups, setBackupGroups] = useState<BackupGroupSelection>({
    characters: true,
    lorebooks: true,
    personas: true,
    soul_memory: true,
    soul_stage: true,
    companion: true,
    settings: true,
  });

  const handleCreateBackup = async () => {
    setIsBackupLoading(true);
    try {
      const entry = await createBackup(backupGroups, backupLabel || undefined);
      setBackupLabel('');
      toast.success(t('int.backupCreated', { file: entry?.filename || t('int.zipArchive') }));
    } catch (e) {
      toast.error(t('int.backupFailed', { error: errorMessage(e) }));
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.restoreBackupTitle', { name: filename }),
      message: translate('confirm.restoreBackupText'),
      confirmLabel: translate('confirm.restore'),
    });
    if (!confirmed) return;
    try {
      const resultMessage = await restoreBackup(filename);
      toast.success(resultMessage ? backendMessage(resultMessage) : t('int.restored'));
    } catch (e) {
      toast.error(t('int.restoreFailed', { error: errorMessage(e) }));
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteBackupTitle', { name: filename }),
      message: translate('confirm.cannotUndo'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteBackup(filename);
      toast.success(t('int.backupDeleted', { file: filename }));
    } catch (e) {
      toast.error(t('int.deleteFailed', { error: errorMessage(e) }));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create Backup Box */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">{t('int.newBackup')}</h2>
            <p className="text-xs text-slate-400">
              {t('int.newBackupIntro')}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t('int.backupNote')}
          </label>
          <input
            type="text"
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder={t('int.backupNotePlaceholder')}
            className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
          />
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-300">
            {t('int.backupGroups')}
          </span>
          {([
            { key: 'characters', label: t('int.group.characters'), icon: Users },
            { key: 'lorebooks', label: t('int.group.lorebooks'), icon: BookOpen },
            { key: 'personas', label: t('int.group.personas'), icon: User },
            { key: 'soul_memory', label: t('int.group.memory'), icon: Brain },
            { key: 'soul_stage', label: t('int.group.stage'), icon: Swords },
            { key: 'companion', label: t('int.group.companion'), icon: Bot },
            { key: 'settings', label: t('int.group.settings'), icon: Settings },
          ] satisfies { key: keyof BackupGroupSelection; label: string; icon: LucideIcon }[]).map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={backupGroups[item.key]}
                onChange={(e) =>
                  setBackupGroups({ ...backupGroups, [item.key]: e.target.checked })
                }
                className="rounded bg-app border-slate-700 text-emerald-600 focus:ring-0"
              />
              <item.icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={isBackupLoading}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition"
        >
          {isBackupLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{t('int.creatingBackup')}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>{t('int.createBackup')}</span>
            </>
          )}
        </button>

        <div className="flex items-start gap-2 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-relaxed">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>{t('int.guarantee')}</strong> {t('int.guaranteeText')}</span>
        </div>
      </div>

      {/* List Existing Backups */}
      <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">
              {t('int.existingBackups', { count: backups.length })}
            </h3>
          </div>

          <button
            onClick={fetchBackups}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            title={t('int.refreshList')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            {t('int.noBackups')}
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((b) => {
              const isSafety = b.is_safety_snapshot;
              const sizeMb = (b.size_bytes / (1024 * 1024)).toFixed(2);
              return (
                <div
                  key={b.filename}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition ${
                    isSafety
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-app border-slate-800/80'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-200">
                        {b.filename}
                      </span>
                      {isSafety ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>{t('int.safetySnapshot')}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {t('int.manualBackup')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {b.created_at}
                      </span>
                      <span>{sizeMb} MB</span>
                      {b.manifest && (
                        <span className="text-slate-500">
                          Version {b.manifest.app_version}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestoreBackup(b.filename)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/40 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{t('int.restore')}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(b.filename)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                      title={t('int.deleteBackup')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
