import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, Download, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { downloadImageLoraTask } from '../../../services/downloadTasks';
import { translate, useTranslation } from '../../../i18n';
import { useStoreFields } from '../../../store/useAppStore';
import { errorMessage } from '../../../utils/errors';
import { confirmDialog, toast } from '../../ui/feedback';
import { OwnLoraDialog, familyLabel } from './OwnLoraDialog';
import type { ImageModelProgress, LoraInfo, LoraSelection, OwnLoraMeta } from '../../../types';

const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1024 ** 2));
const LORA_EXTENSIONS = ['safetensors', 'ckpt', 'pt', 'gguf'];

interface LocalLoraSettingsProps {
  /** Chosen LoRAs with their weights (image settings, or the Image Studio's own choice). */
  selected: LoraSelection[];
  onSelectedChange: (selected: LoraSelection[]) => void;
  /** Family of the chosen image model; `null` shows every LoRA. */
  family: string | null;
}

type Editing = { mode: 'import'; source: string; meta: OwnLoraMeta } | { mode: 'edit'; file: string; meta: OwnLoraMeta };

const ownMeta = (lora: LoraInfo): OwnLoraMeta => ({
  name: lora.name,
  family: lora.family,
  trigger: lora.trigger,
  weight: lora.default_weight,
  nsfw: lora.nsfw,
});

/**
 * LoRAs for the local image model: the checked catalog (download, delete) and the user's own
 * files (imported or put into `loras/`, with name, family, trigger and an 18+ mark). A LoRA is
 * chosen with its weight; it only applies to its model family. LoRAs for adults only show while
 * adult content is on (the backend hides and skips them otherwise).
 */
export const LocalLoraSettings = ({ selected, onSelectedChange, family }: LocalLoraSettingsProps) => {
  const { t } = useTranslation();
  const { nsfwEnabled, adultConfirmed } = useStoreFields('nsfwEnabled', 'adultConfirmed');
  const adultAllowed = nsfwEnabled && adultConfirmed;
  const [loras, setLoras] = useState<LoraInfo[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImageModelProgress | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const refresh = () =>
    api
      .listImageLoras()
      .then(setLoras)
      .catch((e: unknown) => toast.error(errorMessage(e)));

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    api
      .onImageModelProgress(setProgress)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, [adultAllowed]);

  const select = (file: string, weight: number, on: boolean) =>
    onSelectedChange(on ? [...selected.filter((s) => s.file !== file), { file, weight }] : selected.filter((s) => s.file !== file));

  const setWeight = (file: string, weight: number) => onSelectedChange(selected.map((s) => (s.file === file ? { ...s, weight } : s)));

  const handleDownload = async (lora: LoraInfo) => {
    if (!lora.catalog_id) return;
    setDownloading(lora.catalog_id);
    setProgress(null);
    try {
      await downloadImageLoraTask(lora.catalog_id, lora.name);
      toast.success(translate('localImage.downloaded', { name: lora.name }));
      if (!selected.some((s) => s.file === lora.file)) select(lora.file, lora.default_weight, true);
    } catch (e) {
      toast.error(translate('localImage.downloadFailed', { error: errorMessage(e) }));
    } finally {
      setDownloading(null);
      void refresh();
    }
  };

  const handleDelete = async (lora: LoraInfo) => {
    const confirmed = await confirmDialog({
      title: translate('localImage.loraDeleteTitle', { name: lora.name }),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteImageLora(lora.file);
      select(lora.file, 0, false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      void refresh();
    }
  };

  const startImport = async () => {
    const picked = await open({ multiple: false, filters: [{ name: 'LoRA', extensions: LORA_EXTENSIONS }] });
    if (typeof picked !== 'string') return;
    const base = picked.split(/[\\/]/).pop() ?? picked;
    setEditing({
      mode: 'import',
      source: picked,
      meta: { name: base.replace(/\.[^.]+$/, ''), family, trigger: '', weight: 1, nsfw: false },
    });
  };

  const saveEditing = async (meta: OwnLoraMeta) => {
    if (!editing) return;
    try {
      if (editing.mode === 'import') {
        const file = await api.importImageLora(editing.source, meta);
        toast.success(translate('localImage.loraImported', { name: meta.name || file }));
        if (family && meta.family && meta.family !== family) {
          toast.info(translate('localImage.loraOtherFamilyImported', { family: familyLabel(meta.family) }));
        } else {
          select(file, meta.weight || 1, true);
        }
      } else {
        await api.updateImageLora(editing.file, meta);
      }
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const fits = (l: LoraInfo) => !family || !l.family || l.family === family;
  const visible = (loras ?? []).filter(fits);
  // Own files for another model family: named, so an import with another family doesn't just vanish.
  const otherFamily = (loras ?? []).filter((l) => !l.catalog_id && !fits(l));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3" data-testid="lora-settings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-400" />
            {t('localImage.lorasTitle')}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('localImage.lorasIntro')}</p>
        </div>
        <button
          type="button"
          onClick={() => void startImport()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs hover:bg-slate-700"
        >
          <Plus className="w-3.5 h-3.5" /> {t('localImage.loraAdd')}
        </button>
      </div>

      {!loras ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('localImage.loading')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-slate-400">{t('localImage.lorasNone')}</p>
      ) : (
        <ul className="space-y-2" aria-label={t('localImage.lorasTitle')}>
          {visible.map((lora) => {
            const choice = selected.find((s) => s.file === lora.file);
            const isDownloading = downloading !== null && downloading === lora.catalog_id;
            return (
              <li
                key={lora.file}
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  choice ? 'border-accent-500/60 bg-accent-900/15' : 'border-slate-800 bg-app/60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(choice)}
                      disabled={!lora.installed}
                      onChange={(e) => select(lora.file, lora.default_weight, e.target.checked)}
                      className="mt-0.5 accent-accent-500"
                    />
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-100">{lora.name}</span>
                      {lora.nsfw && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">18+</span>
                      )}
                      {lora.noncommercial && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {t('localImage.loraNoncommercial')}
                        </span>
                      )}
                      <span className="block text-slate-400 mt-0.5">
                        {lora.catalog_id
                          ? t('localImage.loraMeta', { size: mb(lora.download_bytes), license: lora.license ?? '' })
                          : lora.family
                            ? t('localImage.loraOwnFamily', { family: familyLabel(lora.family) })
                            : t('localImage.loraOwn')}
                      </span>
                      {lora.trigger && (
                        <span className="block text-slate-400 mt-0.5">{t('localImage.loraTrigger', { trigger: lora.trigger })}</span>
                      )}
                    </span>
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {lora.installed ? (
                      <>
                        {lora.catalog_id ? (
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Check className="w-3.5 h-3.5" />
                            {t('localImage.installed')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing({ mode: 'edit', file: lora.file, meta: ownMeta(lora) })}
                            aria-label={t('localImage.loraEdit', { name: lora.name })}
                            title={t('localImage.loraEdit', { name: lora.name })}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(lora)}
                          aria-label={t('localImage.delete', { name: lora.name })}
                          title={t('localImage.delete', { name: lora.name })}
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
                        onClick={() => void handleDownload(lora)}
                        disabled={downloading !== null}
                        aria-label={t('localImage.loraDownload', { name: lora.name })}
                        className="px-2.5 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('localImage.loraDownloadShort', { size: mb(lora.download_bytes) })}
                      </button>
                    )}
                  </div>
                </div>

                {choice && (
                  <label className="flex items-center gap-2 text-slate-300">
                    {t('localImage.loraWeight')}
                    <input
                      type="range"
                      min={-2}
                      max={2}
                      step={0.1}
                      value={choice.weight}
                      onChange={(e) => setWeight(lora.file, Number(e.target.value))}
                      className="flex-1 accent-accent-500"
                    />
                    <span className="w-10 text-right tabular-nums">{choice.weight.toFixed(1)}</span>
                  </label>
                )}

                {isDownloading && progress?.model_id === lora.catalog_id && (
                  <div role="status" className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress.percent}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {otherFamily.length > 0 && (
        <div className="text-xs text-slate-400 space-y-1" data-testid="lora-other-family">
          <p>{t('localImage.lorasOtherFamily')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {otherFamily.map((lora) => (
              <li key={lora.file} className="flex items-center gap-1 rounded-md border border-slate-800 bg-app/60 pl-2 pr-0.5 py-0.5">
                <span className="text-slate-300">{lora.name}</span>
                <span>· {familyLabel(lora.family ?? '')}</span>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: 'edit', file: lora.file, meta: ownMeta(lora) })}
                  aria-label={t('localImage.loraEdit', { name: lora.name })}
                  title={t('localImage.loraEdit', { name: lora.name })}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <OwnLoraDialog
          mode={editing.mode}
          fileName={editing.mode === 'import' ? editing.source : editing.file}
          initial={editing.meta}
          adultAllowed={adultAllowed}
          onCancel={() => setEditing(null)}
          onSave={saveEditing}
        />
      )}
    </div>
  );
};
