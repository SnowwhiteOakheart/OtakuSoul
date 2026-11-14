import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { ModalOverlay } from '../../ui/ModalOverlay';
import type { OwnLoraMeta } from '../../../types';

/** Model families of the image catalog (`local_image::CATALOG`), as LoRAs are trained for them. */
export const LORA_FAMILIES: Array<[string, string]> = [
  ['sd15', 'SD 1.5'],
  ['sdxl', 'SDXL'],
  ['flux', 'FLUX.1'],
  ['flux2', 'FLUX.2'],
  ['qwen_image', 'Qwen-Image'],
];
export const familyLabel = (family: string) => LORA_FAMILIES.find(([id]) => id === family)?.[1] ?? family;

interface OwnLoraDialogProps {
  /** `import`: a new file (`fileName` is the chosen file); `edit`: an own LoRA in `loras/`. */
  mode: 'import' | 'edit';
  fileName: string;
  initial: OwnLoraMeta;
  /** Adult content is on (NSFW and age confirmed): only then a LoRA can be marked for adults. */
  adultAllowed: boolean;
  onCancel: () => void;
  onSave: (meta: OwnLoraMeta) => Promise<void>;
}

/** Name, model family, trigger words, weight and the 18+ mark of an own LoRA file. */
export const OwnLoraDialog = ({ mode, fileName, initial, adultAllowed, onCancel, onSave }: OwnLoraDialogProps) => {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<OwnLoraMeta>(initial);
  const [saving, setSaving] = useState(false);
  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';
  const update = (patch: Partial<OwnLoraMeta>) => setMeta((m) => ({ ...m, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(meta);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'import' ? t('localImage.loraImportTitle') : t('localImage.loraEditTitle');
  return (
    <ModalOverlay onClose={saving ? undefined : onCancel} aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5" data-testid="own-lora-dialog">
        <div>
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{fileName}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="own-lora-name" className="block text-xs font-semibold text-slate-300">{t('localImage.loraName')}</label>
          <input id="own-lora-name" value={meta.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} maxLength={80} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="own-lora-family" className="block text-xs font-semibold text-slate-300">{t('localImage.loraFamily')}</label>
          <select
            id="own-lora-family"
            value={meta.family ?? ''}
            onChange={(e) => update({ family: e.target.value || null })}
            className={inputClass}
          >
            <option value="">{t('localImage.loraFamilyUnknown')}</option>
            {LORA_FAMILIES.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">{t('localImage.loraFamilyHint')}</p>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            <label htmlFor="own-lora-trigger" className="block text-xs font-semibold text-slate-300">{t('localImage.loraTriggerField')}</label>
            <input id="own-lora-trigger" value={meta.trigger} onChange={(e) => update({ trigger: e.target.value })} className={inputClass} placeholder={t('localImage.loraTriggerPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="own-lora-weight" className="block text-xs font-semibold text-slate-300">{t('localImage.loraWeight')}</label>
            <input
              id="own-lora-weight"
              type="number"
              min={-2}
              max={2}
              step={0.1}
              value={meta.weight || 1}
              onChange={(e) => update({ weight: Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : 1 })}
              className={`${inputClass} w-24`}
            />
          </div>
        </div>

        {adultAllowed ? (
          <label className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-slate-200">
            <input type="checkbox" checked={meta.nsfw} onChange={(e) => update({ nsfw: e.target.checked })} className="mt-0.5 accent-rose-500" />
            <span>
              <span className="font-semibold">{t('localImage.loraNsfw')}</span>
              <span className="block text-slate-400">{t('localImage.loraNsfwHint')}</span>
            </span>
          </label>
        ) : (
          <p className="text-[11px] text-slate-500">{t('localImage.loraNsfwOff')}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-60">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'import' ? t('localImage.loraImport') : t('common.save')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
