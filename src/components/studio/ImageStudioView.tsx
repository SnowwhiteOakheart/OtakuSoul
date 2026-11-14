import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderOpen, ImageIcon, Images, Loader2, RefreshCw, RotateCcw, Square, Trash2, Undo2, Wand2, X } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation, type TranslationKey } from '../../i18n';
import { useStoreFields } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { confirmDialog, toast } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';
import { RuntimeCard } from '../settings/sections/RuntimeCard';
import { StudioFolderPicker } from './StudioFolderPicker';
import { useImageJob } from './imageJobStore';
import {
  ASPECTS,
  DEFAULT_IMAGE_DRAFT,
  MAX_COUNT,
  fromImageRequest,
  loadImageDraft,
  loadImageModelChoice,
  pickImageModel,
  saveImageDraft,
  saveImageModelChoice,
  sizeForAspect,
  toImageRequest,
  type ImageDraft,
} from './imageDraft';
import type { ImageStudioModel, RuntimeInfo, StudioImage } from '../../types';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-slate-300';
/** Thumbnails loaded at once; more on request (a big folder would load every file). */
const PAGE = 24;

/**
 * Image Studio: the user's own images with the local image engine (the models of chat images),
 * with a choice between the installed models, into a folder of their choice, with a gallery.
 */
export const ImageStudioView = () => {
  const { t } = useTranslation();
  const { imageGenConfig, fetchImageGenConfig, setActiveTab, setIntegrationsTab } = useStoreFields(
    'imageGenConfig', 'fetchImageGenConfig', 'setActiveTab', 'setIntegrationsTab',
  );
  const { running, progress, savedCount, start } = useImageJob();
  const [draft, setDraft] = useState<ImageDraft>(loadImageDraft);
  const [advanced, setAdvanced] = useState(false);
  const [models, setModels] = useState<ImageStudioModel[] | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(loadImageModelChoice);
  const [runtime, setRuntime] = useState<RuntimeInfo | null | undefined>(undefined);
  const [images, setImages] = useState<StudioImage[] | null>(null);

  const update = (patch: Partial<ImageDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      saveImageDraft(next);
      return next;
    });

  const refreshImages = useCallback(
    () =>
      api
        .listStudioImages()
        .then(setImages)
        .catch(() => setImages([])),
    [],
  );
  const refreshRuntime = () =>
    api
      .getRuntime('sd')
      .then((info) => setRuntime(info ?? null))
      .catch(() => setRuntime(null));

  useEffect(() => {
    void api.listImageStudioModels().then(setModels).catch(() => setModels([]));
    void refreshRuntime();
    if (!imageGenConfig) void fetchImageGenConfig();
    // Only on opening; the config is loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void refreshImages();
  }, [refreshImages, savedCount]);

  const model = models ? pickImageModel(models, modelChoice, imageGenConfig?.local_model_id) : null;
  const size = model ? sizeForAspect([model.width, model.height], draft.aspect) : null;
  const negative = draft.negative ?? imageGenConfig?.negative_prompt ?? '';
  const canGenerate = !!runtime && !!model && !running && draft.prompt.trim().length > 0;

  const choose = (id: string) => {
    setModelChoice(id);
    saveImageModelChoice(id);
  };

  const generate = () => {
    if (!model) return;
    void start(toImageRequest({ ...draft, negative }, model.id));
  };

  const reuse = (image: StudioImage) => {
    if (!image.request) return;
    const next = fromImageRequest(image.request, image.seed);
    saveImageDraft(next);
    setDraft(next);
    if (models?.some((m) => m.id === image.request?.model_id)) choose(image.request.model_id);
    toast.success(t('studio.reused', { title: image.title }));
  };

  const openDownloads = () => {
    setIntegrationsTab('image');
    setActiveTab('integrations');
  };

  const phase = running ? progress?.phase : null;
  const phaseText = phase
    ? progress && progress.index > 0
      ? t('imageStudio.progress', { index: progress.index, total: progress.total, phase: t(`imageStudio.phase.${phase}` as TranslationKey) })
      : t(`imageStudio.phase.${phase}` as TranslationKey)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden" data-testid="image-studio">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center gap-3 select-none">
        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-accent-600/30 to-sky-600/30 border border-accent-500/40 flex items-center justify-center text-accent-300">
          <Images className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100">{t('imageStudio.title')}</h1>
          <p className="text-xs text-slate-400">{t('imageStudio.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="space-y-5" aria-label={t('imageStudio.formLabel')}>
            <div className="space-y-2 rounded-xl border border-accent-500/25 bg-accent-950/20 p-3" data-testid="image-model">
              <p className="text-xs font-semibold text-accent-200">{t('imageStudio.model')}</p>
              {runtime === undefined || models === null ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <>
                  {!runtime && <RuntimeCard kind="sd" onInstalled={() => void refreshRuntime()} />}
                  {models.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">{t('imageStudio.noModel')}</p>
                      <button type="button" onClick={openDownloads} className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
                        {t('imageStudio.getModels')}
                      </button>
                    </div>
                  ) : models.length === 1 && model ? (
                    <p className="text-sm text-slate-200">
                      {model.name} <span className="text-xs text-slate-500">· {model.license}</span>
                    </p>
                  ) : (
                    <select
                      aria-label={t('imageStudio.model')}
                      value={model?.id ?? ''}
                      onChange={(e) => choose(e.target.value)}
                      disabled={running}
                      className={inputClass}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.license}
                        </option>
                      ))}
                    </select>
                  )}
                  {models.length > 0 && (
                    <button type="button" onClick={openDownloads} className="text-[11px] text-accent-300 hover:text-accent-200">
                      {t('imageStudio.moreModels')}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="image-title" className={labelClass}>{t('studio.fileTitle')}</label>
              <input
                id="image-title"
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder={t('studio.fileTitlePlaceholder')}
                disabled={running}
                className={inputClass}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="image-prompt" className={labelClass}>{t('imageStudio.prompt')}</label>
              <textarea
                id="image-prompt"
                value={draft.prompt}
                onChange={(e) => update({ prompt: e.target.value })}
                placeholder={t('imageStudio.promptPlaceholder')}
                disabled={running}
                rows={5}
                className={inputClass}
              />
              <p className="text-[11px] text-slate-500">{t('imageStudio.promptHint')}</p>
            </div>

            <fieldset className="space-y-2">
              <legend className={labelClass}>
                {t('imageStudio.aspect')} {size && <span className="font-mono text-accent-300">{size[0]} × {size[1]}</span>}
              </legend>
              <div role="radiogroup" className="flex flex-wrap gap-1">
                {ASPECTS.map((aspect) => (
                  <button
                    key={aspect || 'model'}
                    type="button"
                    role="radio"
                    aria-checked={draft.aspect === aspect}
                    disabled={running}
                    onClick={() => update({ aspect })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      draft.aspect === aspect ? 'bg-accent-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {aspect || t('imageStudio.aspectModel')}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="image-count" className={labelClass}>{t('imageStudio.count')}</label>
              <select id="image-count" value={draft.count} onChange={(e) => update({ count: Number(e.target.value) })} disabled={running} className={inputClass}>
                {Array.from({ length: MAX_COUNT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-800">
              <button
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300"
              >
                {t('studio.advanced')}
                <ChevronDown className={`w-4 h-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
              </button>
              {advanced && (
                <div className="grid gap-4 border-t border-slate-800 p-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="image-negative" className={labelClass}>{t('imageStudio.negative')}</label>
                    <textarea
                      id="image-negative"
                      value={negative}
                      onChange={(e) => update({ negative: e.target.value })}
                      disabled={running}
                      rows={3}
                      className={`${inputClass} text-xs`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="image-steps" className={labelClass}>{t('imageStudio.steps')}</label>
                    <input
                      id="image-steps"
                      type="number"
                      min={1}
                      max={150}
                      value={draft.steps ?? ''}
                      placeholder={model ? String(model.steps) : ''}
                      onChange={(e) => {
                        const value = e.currentTarget.valueAsNumber;
                        update({ steps: Number.isFinite(value) ? Math.round(value) : null });
                      }}
                      disabled={running}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="image-cfg" className={labelClass}>{t('imageStudio.cfg')}</label>
                    <input
                      id="image-cfg"
                      type="number"
                      min={0}
                      max={30}
                      step={0.5}
                      value={draft.cfgScale ?? ''}
                      placeholder={model ? String(model.cfg_scale) : ''}
                      onChange={(e) => {
                        const value = e.currentTarget.valueAsNumber;
                        update({ cfgScale: Number.isFinite(value) ? value : null });
                      }}
                      disabled={running}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="image-seed" className={labelClass}>{t('studio.seed')}</label>
                    <input
                      id="image-seed"
                      inputMode="numeric"
                      value={draft.seed}
                      placeholder={t('studio.seedRandom')}
                      onChange={(e) => update({ seed: e.target.value.replace(/\D/g, '') })}
                      disabled={running}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => update({ negative: null, aspect: '', steps: null, cfgScale: null, seed: '', count: DEFAULT_IMAGE_DRAFT.count })}
                      className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {t('studio.resetSettings')}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 sm:col-span-2">{t('imageStudio.advancedHint')}</p>
                </div>
              )}
            </div>

            <StudioFolderPicker kind="images" onChanged={() => void refreshImages()} />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="image-generate"
                disabled={!canGenerate}
                onClick={generate}
                className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {draft.count > 1 ? t('imageStudio.generateMany', { count: draft.count }) : t('imageStudio.generate')}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={() => void api.cancelStudioImages()}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700"
                >
                  <Square className="w-3.5 h-3.5" /> {t('imageStudio.stop')}
                </button>
              )}
            </div>
            {phaseText && (
              <p className="text-xs text-slate-300" role="status" aria-live="polite">
                {phaseText}
              </p>
            )}
            <p className="text-[11px] text-slate-500">{t('imageStudio.hint')}</p>
          </section>

          <Gallery images={images} onRefresh={refreshImages} onReuse={reuse} />
        </div>
      </div>
    </div>
  );
};

/** One file as blob URL, loaded when shown (a chosen folder is outside the asset scope). */
const useBlobUrl = (path: string | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let current: string | null = null;
    let cancelled = false;
    void api
      .readFileBinary(path)
      .then((bytes) => {
        if (cancelled) return;
        const lower = path.toLowerCase();
        const type = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : lower.endsWith('.webp') ? 'image/webp' : 'image/png';
        current = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        setUrl(current);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [path]);
  return url;
};

const Thumbnail = ({ image, onOpen }: { image: StudioImage; onOpen: () => void }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const url = useBlobUrl(visible ? image.path : null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={image.title}
      title={image.title}
      className="group relative aspect-square overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 focus-visible:ring-2 focus-visible:ring-accent-400 outline-hidden"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
      ) : (
        <ImageIcon className="absolute inset-0 m-auto w-6 h-6 text-slate-600" />
      )}
      {/* Fixed white on dark like CoverCard: slate tones turn dark in the light themes. */}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-2 py-1 text-left text-[11px] font-medium text-white">{image.title}</span>
    </button>
  );
};

interface GalleryProps {
  images: StudioImage[] | null;
  onRefresh: () => Promise<void>;
  onReuse: (image: StudioImage) => void;
}

const Gallery = ({ images, onRefresh, onReuse }: GalleryProps) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<StudioImage | null>(null);

  const remove = async (image: StudioImage) => {
    const ok = await confirmDialog({
      title: t('imageStudio.deleteTitle'),
      message: t('studio.deleteMessage', { title: image.title }),
      confirmLabel: t('studio.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteStudioFile('images', image.file_name);
      setOpen(null);
      await onRefresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <section className="space-y-3" aria-label={t('imageStudio.gallery')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-200">{t('imageStudio.gallery')}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => void onRefresh()} title={t('studio.refresh')} aria-label={t('studio.refresh')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => void api.openStudioFolder('images')} title={t('studio.folderOpen')} aria-label={t('studio.folderOpen')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
      </div>
      {images === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">{t('imageStudio.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="image-gallery">
            {images.slice(0, shown).map((image) => (
              <Thumbnail key={image.path} image={image} onOpen={() => setOpen(image)} />
            ))}
          </div>
          {images.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold hover:bg-slate-700">
              {t('imageStudio.showMore', { count: images.length - shown })}
            </button>
          )}
        </>
      )}
      {open && <ImagePreview image={open} onClose={() => setOpen(null)} onReuse={() => { onReuse(open); setOpen(null); }} onDelete={() => void remove(open)} />}
    </section>
  );
};

interface ImagePreviewProps {
  image: StudioImage;
  onClose: () => void;
  onReuse: () => void;
  onDelete: () => void;
}

const ImagePreview = ({ image, onClose, onReuse, onDelete }: ImagePreviewProps) => {
  const { t } = useTranslation();
  const url = useBlobUrl(image.path);
  return (
    <ModalOverlay
      onClose={onClose}
      closeOnBackdrop
      aria-label={image.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3" data-testid="image-preview">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{image.title}</p>
          {image.request && (
            <button type="button" onClick={onReuse} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700">
              <Undo2 className="w-3.5 h-3.5" /> {t('studio.reuse')}
            </button>
          )}
          <button type="button" onClick={onDelete} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-red-950/60 hover:text-red-200">
            <Trash2 className="w-3.5 h-3.5" /> {t('studio.delete')}
          </button>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {url ? <img src={url} alt={image.request?.prompt ?? image.title} className="max-h-[70vh] max-w-full rounded-lg object-contain" /> : <Loader2 className="w-6 h-6 animate-spin text-slate-400" />}
        </div>
        {image.request && (
          <div className="space-y-1 text-xs text-slate-400">
            <p className="text-slate-300">{image.request.prompt}</p>
            <p>
              {image.width > 0 && `${image.width} × ${image.height} · `}
              {image.seed !== null && `${t('studio.seed')} ${image.seed} · `}
              {image.license}
            </p>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
};
