import { open } from '@tauri-apps/plugin-dialog';
import { Activity, FolderOpen, Play, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useStoreFields } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { MOTION_ROLES, type MotionRole } from '../../utils/avatarGestures';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';

/**
 * Body motions of the 3D avatar: imported VRMA files and what they are used for (idle loop,
 * greeting, nodding, emotions). The chat plays them on roleplay actions and emotions.
 */
export const AvatarMotionsSettings = () => {
  const { t } = useTranslation();
  const { avatarMotions, refreshAvatarMotions, playAvatarGesture } = useStoreFields(
    'avatarMotions', 'refreshAvatarMotions', 'playAvatarGesture',
  );
  const [busy, setBusy] = useState(false);

  // Files can also be dropped into the folder directly; opening the settings shows them.
  useEffect(() => {
    void refreshAvatarMotions();
  }, [refreshAvatarMotions]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      await refreshAvatarMotions();
      setBusy(false);
    }
  };

  const importMotions = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: translate('motions.fileFilter'), extensions: ['vrma', 'fbx'] }],
    });
    const files = typeof selected === 'string' ? [selected] : (selected ?? []);
    if (files.length === 0) return;
    await run(async () => {
      for (const file of files) await api.importAvatarMotion(file);
      toast.success(translate('motions.imported', { count: files.length }));
    });
  };

  return (
    <div id="setting-avatar-motions" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-accent2-400" />
          <span>{t('motions.title')}</span>
        </h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => void importMotions()}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('motions.import')}
        </button>
      </div>
      <p className="text-xs text-slate-400">{t('motions.intro')}</p>
      {avatarMotions.length === 0 ? (
        <p className="text-xs text-slate-500 italic">{t('motions.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {avatarMotions.map((motion) => (
            <li key={motion.file} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-slate-200" title={motion.path}>{motion.name}</span>
              <select
                aria-label={t('motions.roleFor', { name: motion.name })}
                value={motion.role}
                disabled={busy}
                onChange={(e) => void run(() => api.setAvatarMotionRole(motion.file, e.target.value))}
                className="w-40 bg-app border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
              >
                <option value="">{t('motions.role.none')}</option>
                {MOTION_ROLES.map((role) => (
                  <option key={role} value={role}>{t(`motions.role.${role}` as TranslationKey)}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!motion.role || motion.role === 'idle'}
                onClick={() => playAvatarGesture(motion.role as MotionRole)}
                title={t('motions.preview')}
                aria-label={t('motions.previewFor', { name: motion.name })}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.deleteAvatarMotion(motion.file))}
                title={t('motions.delete')}
                aria-label={t('motions.deleteFor', { name: motion.name })}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
