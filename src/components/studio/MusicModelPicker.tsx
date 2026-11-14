import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { RuntimeCard } from '../settings/sections/RuntimeCard';
import type { MusicModelInfo, MusicModelProgress, RuntimeInfo } from '../../types';

const MODEL_KEY = 'otakusoul.musicModel';
export const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

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

/**
 * ACE-Step runtime (acestep.cpp) and model sets with their download, shared by the story music
 * and the Song Studio. `chosen` is the user's pick, else an installed or the recommended set.
 */
export const useMusicModels = () => {
  const [runtime, setRuntime] = useState<RuntimeInfo | null | undefined>(undefined);
  const [models, setModels] = useState<MusicModelInfo[] | null>(null);
  const [modelId, setModelId] = useState<string | null>(loadModelChoice);
  const [download, setDownload] = useState<MusicModelProgress | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refreshModels = () =>
    api
      .listMusicModels()
      .then((list) => setModels(list ?? []))
      .catch(() => setModels([]));
  const refreshRuntime = () =>
    api
      .getRuntime('ace')
      .then((info) => setRuntime(info ?? null))
      .catch(() => setRuntime(null));

  useEffect(() => {
    void refreshRuntime();
    void refreshModels();
    const stop = api.onMusicModelProgress(setDownload);
    return () => void stop.then((unlisten) => unlisten()).catch(() => {});
  }, []);

  const chosen =
    models?.find((m) => m.id === modelId) ?? models?.find((m) => m.installed) ?? models?.find((m) => m.recommended) ?? models?.[0];

  const choose = (id: string) => {
    setModelId(id);
    saveModelChoice(id);
  };

  return {
    runtime,
    models,
    chosen,
    choose,
    download,
    downloading,
    setDownloading,
    setDownload,
    refreshModels,
    refreshRuntime,
    loading: runtime === undefined || models === null,
    /** Runtime and the chosen set are on disk: generating can start. */
    ready: !!runtime && !!chosen?.installed,
  };
};

export type MusicModels = ReturnType<typeof useMusicModels>;

interface MusicModelPickerProps {
  music: MusicModels;
  /** While generating nothing may change. */
  disabled?: boolean;
}

/** Runtime card, the model sets as radio list and the download of the chosen one. */
export const MusicModelPicker = ({ music, disabled }: MusicModelPickerProps) => {
  const { t } = useTranslation();
  const { runtime, models, chosen, choose, download, downloading } = music;

  const downloadModel = async () => {
    if (!chosen) return;
    music.setDownloading(true);
    music.setDownload(null);
    try {
      await api.downloadMusicModel(chosen.id);
      toast.success(t('musicGen.modelReady', { name: chosen.name }));
    } catch (error) {
      toast.error(t('musicGen.downloadFailed', { error: errorMessage(error) }));
    } finally {
      music.setDownloading(false);
      void music.refreshModels();
    }
  };

  if (music.loading || !models) {
    return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  }

  return (
    <div className="space-y-3">
      {!runtime && <RuntimeCard kind="ace" onInstalled={() => void music.refreshRuntime()} />}

      <div className="space-y-1" role="radiogroup" aria-label={t('musicGen.model')}>
        {models.map((m) => (
          <label key={m.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <input
              type="radio"
              name="music-model"
              checked={chosen?.id === m.id}
              onChange={() => choose(m.id)}
              disabled={disabled || downloading}
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
        <div className="flex flex-wrap items-center gap-2">
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
          {downloading && (
            <button type="button" onClick={() => void api.cancelMusicModelDownload()} className="text-xs text-slate-400 underline hover:text-slate-200">
              {t('common.cancel')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
