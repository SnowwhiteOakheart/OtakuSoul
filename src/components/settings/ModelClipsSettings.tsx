import { Clapperboard, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { MOTION_ROLES, type MotionRole } from '../../utils/avatarGestures';
import { errorMessage } from '../../utils/errors';
import type { ModelClip } from '../../types';
import { toast } from '../ui/feedback';

/**
 * Animations stored inside a glTF avatar (e.g. a game figure exported from Blender) and what
 * they are used for. They win over imported motions of the same use.
 */
export const ModelClipsSettings = () => {
  const { t } = useTranslation();
  const { scannedVrms, activeVrmPath, playAvatarGesture, bumpModelClipRevision } = useStoreFields(
    'scannedVrms', 'activeVrmPath', 'playAvatarGesture', 'bumpModelClipRevision',
  );
  const models = scannedVrms.filter((m) => m.format === 'gltf');
  const [chosen, setChosen] = useState('');
  const modelPath = models.some((m) => m.path === chosen)
    ? chosen
    : (models.find((m) => m.path === activeVrmPath) ?? models[0])?.path ?? '';
  const [clips, setClips] = useState<ModelClip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modelPath) return;
    let cancelled = false;
    api
      .listModelClips(modelPath)
      .then((list) => {
        if (cancelled) return;
        setClips(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setClips([]);
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  if (models.length === 0) return null;

  const assign = async (clip: string, role: string) => {
    setBusy(true);
    try {
      await api.setModelClipRole(modelPath, clip, role);
      setClips((list) => list.map((c) => (c.name === clip ? { ...c, role } : c)));
      bumpModelClipRevision();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="setting-model-clips" className="space-y-2 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Clapperboard className="w-3.5 h-3.5 text-accent2-400" />
          <span>{t('modelClips.title')}</span>
        </h4>
        {models.length > 1 && (
          <select
            aria-label={t('modelClips.model')}
            value={modelPath}
            onChange={(e) => setChosen(e.target.value)}
            className="max-w-56 bg-app border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
          >
            {models.map((m) => (
              <option key={m.path} value={m.path}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-slate-400">{t('modelClips.intro')}</p>
      {error ? (
        <p role="alert" className="text-xs text-rose-300">{error}</p>
      ) : clips.length === 0 ? (
        <p className="text-xs text-slate-500 italic">{t('modelClips.empty')}</p>
      ) : (
        <ul className="space-y-1.5" data-model-clips={clips.length}>
          {clips.map((clip) => (
            <li key={clip.name} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-slate-200" title={clip.name}>{clip.name}</span>
              <select
                aria-label={t('motions.roleFor', { name: clip.name })}
                value={clip.role}
                disabled={busy}
                onChange={(e) => void assign(clip.name, e.target.value)}
                className="w-40 bg-app border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
              >
                <option value="">{t('motions.role.none')}</option>
                {MOTION_ROLES.map((role) => (
                  <option key={role} value={role}>{t(`motions.role.${role}` as TranslationKey)}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!clip.role || clip.role === 'idle'}
                onClick={() => playAvatarGesture(clip.role as MotionRole)}
                title={t('motions.preview')}
                aria-label={t('motions.previewFor', { name: clip.name })}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
