import { useEffect, useState } from 'react';
import { Download, Loader2, Square, Wand2 } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { errorCode, errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { RuntimeCard } from '../settings/sections/RuntimeCard';
import type { MusicGenProgress, MusicModelInfo, MusicModelProgress, RuntimeInfo, SceneDefinition, SceneMusicPlan } from '../../types';

const MODEL_KEY = 'otakusoul.musicModel';
const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

const loadModelChoice = () => {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
};
const saveModelChoice = (id: string) => {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // Only a convenience: the recommended set is preselected next time.
  }
};

/** Tracks still missing in the plan (each mood up to its `count`). */
export const missingTracks = (plan: SceneMusicPlan) =>
  plan.moods.reduce((sum, m) => sum + Math.max(0, m.count - m.installed), 0);

interface StoryMusicGeneratorProps {
  definition: SceneDefinition;
  plan: SceneMusicPlan;
  /** Reads the plan and the music folder again (after new tracks). */
  onGenerated: () => Promise<void>;
}

/**
 * Generates a story's music with ACE-Step before playing: runtime (acestep.cpp), a model set and
 * the missing tracks of the plan, with progress and cancel. The chat model makes room meanwhile.
 */
export const StoryMusicGenerator = ({ definition, plan, onGenerated }: StoryMusicGeneratorProps) => {
  const { t } = useTranslation();
  const [runtime, setRuntime] = useState<RuntimeInfo | null | undefined>(undefined);
  const [models, setModels] = useState<MusicModelInfo[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(loadModelChoice);
  const [download, setDownload] = useState<MusicModelProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<MusicGenProgress | null>(null);
  const [generating, setGenerating] = useState(false);

  const refreshModels = () =>
    api
      .listMusicModels()
      .then((list) => setModels(list ?? []))
      .catch(() => setModels([]));

  useEffect(() => {
    void api.getRuntime('ace').then((info) => setRuntime(info ?? null)).catch(() => setRuntime(null));
    void refreshModels();
    const stops = [api.onMusicModelProgress(setDownload), api.onMusicGenProgress(setProgress)];
    return () => stops.forEach((stop) => void stop.then((unlisten) => unlisten()).catch(() => {}));
  }, []);

  const chosen =
    models?.find((m) => m.id === modelId) ?? models?.find((m) => m.installed) ?? models?.find((m) => m.recommended) ?? models?.[0];
  const missing = missingTracks(plan);

  const choose = (id: string) => {
    setModelId(id);
    saveModelChoice(id);
  };

  const downloadModel = async () => {
    if (!chosen) return;
    setDownloading(true);
    setDownload(null);
    try {
      await api.downloadMusicModel(chosen.id);
      toast.success(t('musicGen.modelReady', { name: chosen.name }));
    } catch (error) {
      toast.error(t('musicGen.downloadFailed', { error: errorMessage(error) }));
    } finally {
      setDownloading(false);
      void refreshModels();
    }
  };

  const generate = async () => {
    if (!chosen) return;
    setGenerating(true);
    setProgress(null);
    try {
      const count = await api.generateSceneMusic(definition, chosen.id);
      toast.success(t('musicGen.done', { count }));
    } catch (error) {
      // A cancel is the user's own choice, not an error.
      if (errorCode(error)?.code !== 'backend.music.cancelled') toast.error(t('musicGen.failed', { error: errorMessage(error) }));
    } finally {
      setGenerating(false);
      await onGenerated();
    }
  };

  if (runtime === undefined || models === null) {
    return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  }

  const phase = progress && generating ? progress.phase : null;
  const phaseText = phase
    ? progress && progress.track > 0 && (phase === 'composing' || phase === 'rendering' || phase === 'saved')
      ? t('musicGen.track', {
          track: progress.track,
          total: progress.total,
          mood: t(`stageMusic.mood.${progress.mood}` as 'stageMusic.mood.calm'),
          phase: t(`musicGen.phase.${phase}` as 'musicGen.phase.composing'),
        })
      : t(`musicGen.phase.${phase}` as 'musicGen.phase.composing')
    : null;

  return (
    <div className="space-y-3 rounded-xl border border-accent-500/25 bg-accent-950/20 p-3" data-testid="music-generator">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-200">
        <Wand2 className="w-3.5 h-3.5" /> {t('musicGen.title')}
      </p>
      <p className="text-xs text-slate-400">{t('musicGen.intro')}</p>

      {!runtime && <RuntimeCard kind="ace" onInstalled={() => void api.getRuntime('ace').then(setRuntime)} />}

      <div className="space-y-1" role="radiogroup" aria-label={t('musicGen.model')}>
        {models.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="radio"
              name="music-model"
              checked={chosen?.id === m.id}
              onChange={() => choose(m.id)}
              disabled={generating || downloading}
              className="accent-accent-500"
            />
            <span className="font-medium">{m.name}</span>
            <span className="text-slate-500">
              {t('musicGen.modelMeta', { size: gb(m.download_bytes), vram: (m.vram_mb / 1024).toFixed(0) })}
            </span>
            {m.recommended && <span className="rounded bg-emerald-900/40 px-1 text-[11px] text-emerald-200">{t('runtime.recommended')}</span>}
            {m.installed && <span className="rounded bg-slate-800 px-1 text-[11px] text-slate-300">{t('musicGen.installed')}</span>}
          </label>
        ))}
      </div>

      {chosen && !chosen.installed && (
        <button
          type="button"
          disabled={downloading}
          onClick={() => void downloadModel()}
          className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {downloading && download
            ? t('musicGen.downloading', { percent: download.percent.toFixed(0) })
            : t('musicGen.download', { size: gb(chosen.missing_bytes) })}
        </button>
      )}
      {downloading && (
        <button type="button" onClick={() => void api.cancelMusicModelDownload()} className="text-xs text-slate-400 underline hover:text-slate-200">
          {t('common.cancel')}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="music-generate"
          disabled={!runtime || !chosen?.installed || missing === 0 || generating}
          onClick={() => void generate()}
          className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {missing === 0 ? t('musicGen.nothingMissing') : t('musicGen.generate', { count: missing })}
        </button>
        {generating && (
          <button
            type="button"
            onClick={() => void api.cancelMusicGeneration()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700"
          >
            <Square className="w-3 h-3" /> {t('musicGen.stop')}
          </button>
        )}
      </div>
      {phaseText && (
        <p className="text-xs text-slate-300" role="status" aria-live="polite">
          {phaseText}
        </p>
      )}
      <p className="text-[11px] text-slate-500">{t('musicGen.hint')}</p>
    </div>
  );
};
