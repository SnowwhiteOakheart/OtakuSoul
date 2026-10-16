import { Eye, Play, Plus, RotateCcw, Smile, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import type { ModelFace } from '../../types';
import { toast } from '../ui/feedback';

/** Face keys in the order the editor shows them (same list as `avatar_motions::FACE_KEYS`). */
export const FACE_KEYS = ['blink', 'aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'surprised', 'relaxed'] as const;
const SAVE_DELAY_MS = 400;
// Loaded only when the live preview is opened (three.js is large).
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));

/**
 * Face editor for glTF avatars: which morph targets show blinking, mouth shapes and emotions (for
 * models whose names OtakuSoul does not know) and how strong each key is (morphs and face bones).
 */
export const ModelFaceSettings = () => {
  const { t } = useTranslation();
  const { scannedVrms, activeVrmPath, previewAvatarFace, bumpModelClipRevision, avatarMotions, avatarGesture } = useStoreFields(
    'scannedVrms', 'activeVrmPath', 'previewAvatarFace', 'bumpModelClipRevision', 'avatarMotions', 'avatarGesture',
  );
  // The settings page shows no avatar: previews play on this small one while it is open.
  const [live, setLive] = useState(false);
  const models = scannedVrms.filter((m) => m.format === 'gltf');
  const [chosen, setChosen] = useState('');
  const modelPath = models.some((m) => m.path === chosen)
    ? chosen
    : (models.find((m) => m.path === activeVrmPath) ?? models[0])?.path ?? '';
  const [available, setAvailable] = useState<string[]>([]);
  const [face, setFace] = useState<ModelFace>({ morphs: {}, strength: {} });
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!modelPath) return;
    let cancelled = false;
    dirty.current = false;
    api
      .getModelFace(modelPath)
      .then((info) => {
        if (cancelled) return;
        setAvailable(info.available);
        setFace(info.face);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  // Saved shortly after the last change, so dragging a slider does not write on every step.
  useEffect(() => {
    if (!dirty.current || !modelPath) return;
    const timer = window.setTimeout(() => {
      api
        .setModelFace(modelPath, face)
        .then(() => bumpModelClipRevision())
        .catch((e) => toast.error(errorMessage(e)));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [face, modelPath, bumpModelClipRevision]);

  if (models.length === 0) return null;

  const change = (update: (face: ModelFace) => ModelFace) => {
    dirty.current = true;
    setFace((current) => update(current));
  };
  const morphsOf = (key: string) => face.morphs[key] ?? [];
  const setMorphs = (key: string, list: { morph: string; weight: number }[]) =>
    change((f) => ({ ...f, morphs: { ...f.morphs, [key]: list } }));
  const strengthOf = (key: string) => face.strength[key] ?? 1;

  return (
    <div id="setting-model-face" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Smile className="w-3.5 h-3.5 text-accent2-400" />
          <span>{t('modelFace.title')}</span>
        </h3>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            aria-pressed={live}
            onClick={() => setLive(!live)}
            className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1 ${live ? 'border-accent-500 bg-accent-900/40 text-accent-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            <Eye className="w-3 h-3" />
            {t('modelFace.livePreview')}
          </button>
          <button
            type="button"
            onClick={() => change(() => ({ morphs: {}, strength: {} }))}
            className="px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            {t('modelFace.reset')}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">{t(available.length ? 'modelFace.intro' : 'modelFace.introBones')}</p>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {live && modelPath && (
        <div className="h-80 rounded-lg overflow-hidden border border-slate-800" data-face-live>
          <Suspense fallback={null}>
            <GltfViewer key={modelPath} modelPath={modelPath} emotion="neutral" motions={avatarMotions} gesture={avatarGesture} />
          </Suspense>
        </div>
      )}
      <ul className="space-y-2" data-face-editor={available.length}>
        {FACE_KEYS.map((key) => (
          <li key={key} className="flex flex-wrap items-center gap-2 text-xs" data-face-key={key}>
            <span className="w-32 text-slate-200">{t(`modelFace.key.${key}` as TranslationKey)}</span>
            <div className="flex-1 min-w-48 space-y-1">
              {morphsOf(key).map((entry, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <select
                    aria-label={t('modelFace.morphFor', { name: t(`modelFace.key.${key}` as TranslationKey) })}
                    value={entry.morph}
                    onChange={(e) => setMorphs(key, morphsOf(key).map((m, i) => (i === index ? { ...m, morph: e.target.value } : m)))}
                    className="flex-1 min-w-0 bg-app border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
                  >
                    {available.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={entry.weight}
                    aria-label={t('modelFace.weight')}
                    onChange={(e) => setMorphs(key, morphsOf(key).map((m, i) => (i === index ? { ...m, weight: Number(e.target.value) } : m)))}
                    className="w-20 accent-accent-500"
                  />
                  <button
                    type="button"
                    onClick={() => setMorphs(key, morphsOf(key).filter((_, i) => i !== index))}
                    aria-label={t('modelFace.removeMorph')}
                    className="p-1 rounded border border-slate-700 text-slate-400 hover:text-rose-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {available.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMorphs(key, [...morphsOf(key), { morph: available[0]!, weight: 1 }])}
                  className="px-2 py-0.5 rounded border border-dashed border-slate-700 text-slate-400 hover:text-accent-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {morphsOf(key).length ? t('modelFace.addMorph') : t('modelFace.chooseMorph')}
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-slate-400">
              <span>{t('modelFace.strength')}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={strengthOf(key)}
                aria-label={t('modelFace.strengthFor', { name: t(`modelFace.key.${key}` as TranslationKey) })}
                onChange={(e) => change((f) => ({ ...f, strength: { ...f.strength, [key]: Number(e.target.value) } }))}
                className="w-24 accent-accent-500"
              />
              <span className="w-9 text-right tabular-nums">{Math.round(strengthOf(key) * 100)} %</span>
            </label>
            <button
              type="button"
              onClick={() => previewAvatarFace(key)}
              title={t('motions.preview')}
              aria-label={t('modelFace.previewFor', { name: t(`modelFace.key.${key}` as TranslationKey) })}
              className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
