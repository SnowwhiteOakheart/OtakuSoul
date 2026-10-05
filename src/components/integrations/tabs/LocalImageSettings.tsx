import { useEffect, useState } from 'react';
import { Check, Download, HardDrive, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { downloadImageModelTask } from '../../../services/downloadTasks';
import { translate, useTranslation } from '../../../i18n';
import { errorMessage } from '../../../utils/errors';
import { confirmDialog, toast } from '../../ui/feedback';
import { RuntimeCard } from '../../settings/sections/RuntimeCard';
import { LocalLoraSettings } from './LocalLoraSettings';
import type { ImageGenConfig, ImageModelInfo, ImageModelProgress, VramStrategy } from '../../../types';

const STRATEGIES: VramStrategy[] = ['auto', 'parallel', 'swap', 'reduce_llm'];

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

interface LocalImageSettingsProps {
  config: ImageGenConfig;
  onChange: (config: ImageGenConfig) => void;
}

/**
 * Settings of the `local` provider: the stable-diffusion.cpp runtime, the image model catalog
 * (download, delete, choose) and how the image model shares the GPU with the chat model.
 */
export const LocalImageSettings = ({ config, onChange }: LocalImageSettingsProps) => {
  const { t } = useTranslation();
  const [models, setModels] = useState<ImageModelInfo[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImageModelProgress | null>(null);

  const refresh = () =>
    api
      .listImageModels()
      .then(setModels)
      .catch((e: unknown) => toast.error(errorMessage(e)));

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    api
      .onImageModelProgress(setProgress)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const handleDownload = async (model: ImageModelInfo) => {
    setDownloading(model.id);
    setProgress(null);
    try {
      await downloadImageModelTask(model.id, model.name);
      toast.success(translate('localImage.downloaded', { name: model.name }));
      if (!config.local_model_id) onChange({ ...config, local_model_id: model.id });
    } catch (e) {
      toast.error(translate('localImage.downloadFailed', { error: errorMessage(e) }));
    } finally {
      setDownloading(null);
      void refresh();
    }
  };

  const handleDelete = async (model: ImageModelInfo) => {
    const confirmed = await confirmDialog({
      title: translate('localImage.deleteTitle', { name: model.name }),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteImageModel(model.id);
      if (config.local_model_id === model.id) onChange({ ...config, local_model_id: null });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      void refresh();
    }
  };

  return (
    <div className="space-y-4">
      <RuntimeCard kind="sd" />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent-400" />
            {t('localImage.modelsTitle')}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('localImage.modelsIntro')}</p>
        </div>

        {!models ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('localImage.loading')}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={t('localImage.modelsTitle')}>
            {models.map((model) => {
              const selected = config.local_model_id === model.id;
              const isDownloading = downloading === model.id;
              const partial = !model.installed && model.missing_bytes < model.download_bytes;
              return (
                <li
                  key={model.id}
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    selected ? 'border-accent-500/60 bg-accent-900/15' : 'border-slate-800 bg-app/60'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                      <input
                        type="radio"
                        name="local-image-model"
                        checked={selected}
                        disabled={!model.installed}
                        onChange={() => onChange({ ...config, local_model_id: model.id })}
                        className="mt-0.5 accent-accent-500"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-100">{model.name}</span>
                        {model.recommended && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {t('localImage.recommended')}
                          </span>
                        )}
                        <span className="block text-slate-400 mt-0.5">
                          {t('localImage.meta', {
                            vram: gb(model.vram_mb * 1024 * 1024),
                            size: gb(model.download_bytes),
                            license: model.license,
                          })}
                        </span>
                        {!model.fits_gpu && (
                          <span className="block text-amber-300/90 mt-0.5">{t('localImage.tooBig')}</span>
                        )}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {model.installed ? (
                        <>
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Check className="w-3.5 h-3.5" />
                            {t('localImage.installed')}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDelete(model)}
                            aria-label={t('localImage.delete', { name: model.name })}
                            title={t('localImage.delete', { name: model.name })}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : isDownloading ? (
                        <button
                          type="button"
                          onClick={() => void api.cancelImageModelDownload()}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t('localImage.cancel')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDownload(model)}
                          disabled={downloading !== null}
                          className="px-2.5 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {partial
                            ? t('localImage.resume', { size: gb(model.missing_bytes) })
                            : t('localImage.download', { size: gb(model.download_bytes) })}
                        </button>
                      )}
                    </div>
                  </div>

                  {isDownloading && progress?.model_id === model.id && (
                    <div role="status" className="space-y-1 text-slate-400">
                      <span>
                        {t('localImage.progress', {
                          file: progress.file_name,
                          done: gb(progress.downloaded_bytes),
                          total: gb(progress.total_bytes),
                        })}
                      </span>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LocalLoraSettings
        config={config}
        onChange={onChange}
        family={models?.find((m) => m.id === config.local_model_id)?.family ?? null}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
        <label htmlFor="vram-strategy" className="block text-sm font-semibold text-slate-200">
          {t('localImage.strategy')}
        </label>
        <select
          id="vram-strategy"
          value={config.vram_strategy ?? 'auto'}
          onChange={(e) => onChange({ ...config, vram_strategy: e.target.value as VramStrategy })}
          className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
        >
          {STRATEGIES.map((strategy) => (
            <option key={strategy} value={strategy}>
              {t(`localImage.strategy.${strategy}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">{t(`localImage.strategyHint.${config.vram_strategy ?? 'auto'}`)}</p>
      </div>
    </div>
  );
};
