import { useEffect, useState } from 'react';
import { Download, HardDriveDownload, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { errorMessage } from '../../../utils/errors';
import { toast } from '../../ui/feedback';
import type { RuntimeInfo, RuntimeKind, RuntimeProgress, RuntimeVariant } from '../../../types';

/** Readable name of a llama.cpp backend, e.g. `cuda-12.8` → "CUDA 12.8 (NVIDIA)". */
export const backendLabel = (backend: string): string => {
  if (backend === 'cpu') return translate('runtime.backendCpu');
  if (backend === 'vulkan') return translate('runtime.backendVulkan');
  if (backend === 'metal') return translate('runtime.backendMetal');
  if (backend.startsWith('cuda-')) return translate('runtime.backendCuda', { version: backend.slice(5) });
  if (backend.startsWith('rocm-')) return translate('runtime.backendRocm', { version: backend.slice(5) });
  if (backend.startsWith('hip-')) return translate('runtime.backendHip');
  return backend;
};

interface RuntimeCardProps {
  /** llama.cpp, the PrismML fork (Ternary Bonsai) or stable-diffusion.cpp (local images). */
  kind: RuntimeKind;
  onInstalled?: () => void;
}

/** Downloads a prebuilt server runtime of `kind` for this system. */
export const RuntimeCard = ({ kind, onInstalled }: RuntimeCardProps) => {
  const { t } = useTranslation();
  const [installed, setInstalled] = useState<RuntimeInfo | null>(null);
  const [variants, setVariants] = useState<RuntimeVariant[] | null>(null);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [previous, setPrevious] = useState<RuntimeInfo | null>(null);
  const loadPrevious = () => api.getPreviousRuntime(kind).then(setPrevious).catch(() => setPrevious(null));

  const fetchVariants = () =>
    api
      .listRuntimeVariants(kind)
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
    api.getRuntime(kind).then(setInstalled).catch(() => setInstalled(null));
    void loadPrevious();
    void fetchVariants();
    let unlisten: (() => void) | undefined;
    api
      .onRuntimeProgress((p) => {
        if (p.kind === kind) setProgress(p);
      })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
    // fetchVariants only depends on kind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const variant = variants?.find((v) => v.backend === selected);
  const upToDate = Boolean(installed && variant && installed.build === variant.build && installed.backend === variant.backend);

  const handleInstall = async () => {
    if (!variant) return;
    setInstalling(true);
    setProgress(null);
    try {
      const info = await api.installRuntime(kind, variant.backend);
      setInstalled(info);
      void loadPrevious();
      toast.success(t(`runtime.${kind}.installed`, { build: info.build, backend: backendLabel(info.backend) }));
      onInstalled?.();
    } catch (e) {
      toast.error(t('runtime.installFailed', { error: errorMessage(e) }));
    } finally {
      setInstalling(false);
    }
  };

  // An update that misbehaves can be undone: the previous build stays until the next update.
  const handleRollback = async () => {
    try {
      const info = await api.rollbackRuntime(kind);
      setInstalled(info);
      void loadPrevious();
      toast.success(t('runtime.rolledBack', { build: info.build }));
      onInstalled?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-accent-400" />
            {t(`runtime.${kind}.title`)}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t(`runtime.${kind}.intro`)}</p>
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
          : t(`runtime.${kind}.statusNone`)}
      </p>

      {variantsError ? (
        <p role="alert" className="text-xs text-rose-300">
          {t('runtime.variantsFailed', { error: variantsError })}
        </p>
      ) : !variants ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
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

      {previous && !installing && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>{t('runtime.previous', { build: previous.build, backend: backendLabel(previous.backend) })}</span>
          <button
            type="button"
            onClick={() => void handleRollback()}
            className="px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            {t('runtime.rollback', { build: previous.build })}
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
