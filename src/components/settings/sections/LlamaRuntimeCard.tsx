import { useEffect, useState } from 'react';
import { Download, HardDriveDownload, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { errorMessage } from '../../../utils/errors';
import { toast } from '../../ui/feedback';
import type { LlamaRuntimeInfo, LlamaRuntimeProgress, LlamaRuntimeVariant } from '../../../types';

/** Readable name of a llama.cpp backend, e.g. `cuda-12.8` → "CUDA 12.8 (NVIDIA)". */
export const backendLabel = (backend: string): string => {
  if (backend === 'cpu') return translate('runtime.backendCpu');
  if (backend === 'vulkan') return translate('runtime.backendVulkan');
  if (backend === 'metal') return translate('runtime.backendMetal');
  if (backend.startsWith('cuda-')) return translate('runtime.backendCuda', { version: backend.slice(5) });
  if (backend.startsWith('rocm-')) return translate('runtime.backendRocm', { version: backend.slice(5) });
  return backend;
};

/** Downloads the official llama.cpp server build for this system (Settings → server). */
export const LlamaRuntimeCard = ({ onInstalled }: { onInstalled?: () => void }) => {
  const { t } = useTranslation();
  const [installed, setInstalled] = useState<LlamaRuntimeInfo | null>(null);
  const [variants, setVariants] = useState<LlamaRuntimeVariant[] | null>(null);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [progress, setProgress] = useState<LlamaRuntimeProgress | null>(null);
  const [installing, setInstalling] = useState(false);

  const fetchVariants = () =>
    api
      .listLlamaRuntimeVariants()
      .then((list) => {
        setVariants(list);
        setSelected((current) => current || list[0]?.backend || '');
      })
      .catch((e: unknown) => setVariantsError(errorMessage(e)));

  const reloadVariants = () => {
    setVariantsError(null);
    setVariants(null);
    void fetchVariants();
  };

  useEffect(() => {
    api.getLlamaRuntime().then(setInstalled).catch(() => setInstalled(null));
    void fetchVariants();
    let unlisten: (() => void) | undefined;
    api.onLlamaRuntimeProgress(setProgress).then((fn) => (unlisten = fn)).catch(() => {});
    return () => unlisten?.();
  }, []);

  const variant = variants?.find((v) => v.backend === selected);
  const upToDate = Boolean(installed && variant && installed.build === variant.build && installed.backend === variant.backend);

  const handleInstall = async () => {
    if (!variant) return;
    setInstalling(true);
    setProgress(null);
    try {
      const info = await api.installLlamaRuntime(variant.backend);
      setInstalled(info);
      toast.success(t('runtime.installed', { build: info.build, backend: backendLabel(info.backend) }));
      onInstalled?.();
    } catch (e) {
      toast.error(t('runtime.installFailed', { error: errorMessage(e) }));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-accent-400" />
            {t('runtime.title')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('runtime.intro')}</p>
        </div>
        <button
          type="button"
          onClick={reloadVariants}
          aria-label={t('runtime.reload')}
          title={t('runtime.reload')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-300">
        {installed
          ? t('runtime.statusInstalled', { build: installed.build, backend: backendLabel(installed.backend) })
          : t('runtime.statusNone')}
      </p>

      {variantsError ? (
        <p role="alert" className="text-xs text-rose-300">
          {t('runtime.variantsFailed', { error: variantsError })}
        </p>
      ) : !variants ? (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('runtime.loadingVariants')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label={t('runtime.variant')}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={installing}
            className="flex-1 min-w-48 bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
          >
            {variants.map((v) => (
              <option key={v.backend} value={v.backend}>
                {backendLabel(v.backend)} · {Math.round(v.download_bytes / 1024 / 1024)} MB
                {v.recommended ? ` · ${t('runtime.recommended')}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing || !variant}
            className="px-3.5 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5"
          >
            {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="whitespace-nowrap">
              {upToDate ? t('runtime.reinstall') : installed ? t('runtime.update', { build: variant?.build ?? '' }) : t('runtime.install', { build: variant?.build ?? '' })}
            </span>
          </button>
        </div>
      )}

      {installing && progress && (
        <div role="status" className="space-y-1.5 text-xs text-slate-400">
          <span>
            {progress.phase === 'extract'
              ? t('runtime.extracting')
              : t('runtime.downloading', {
                  done: Math.round(progress.downloaded_bytes / 1024 / 1024),
                  total: Math.round(progress.total_bytes / 1024 / 1024),
                })}
          </span>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};
