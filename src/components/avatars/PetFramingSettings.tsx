import { useState } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { RotateCcw, Tv } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { PetFramePreview } from '../companion/PetFramePreview';
import { DEFAULT_PET_FRAMING, PET_LIFT_RANGE, PET_ZOOM_RANGE, type PetFraming } from '../../services/avatarViewState';
import { loadPetFraming, PET_FRAMING_EVENT, PET_LABEL, savePetFraming, type PetFramingChange } from '../../services/desktopPet';

/**
 * The desktop pet's framing of one model, for figures the fixed whole-body view shows too
 * small or cut off (chibi, very tall hair, MMD props). Opened on demand: the preview is a
 * second 3D view. Changes reach an open pet showing this model at once.
 */
export function PetFramingSettings({ path }: { path: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [framing, setFraming] = useState<PetFraming>(() => loadPetFraming(path));

  const change = (next: PetFraming) => {
    setFraming(next);
    savePetFraming(path, next);
    void emitTo(PET_LABEL, PET_FRAMING_EVENT, { modelPath: path, framing: next } satisfies PetFramingChange).catch(() => {});
  };
  const isDefault = framing.zoom === DEFAULT_PET_FRAMING.zoom && framing.lift === DEFAULT_PET_FRAMING.lift;

  return (
    <details
      className="rounded-lg border border-slate-800 p-3"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      data-pet-framing
    >
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-200">
        <Tv className="h-4 w-4 text-cyan-400" aria-hidden />
        {t('avatars.petFraming')}
        {!isDefault && <span className="text-xs font-normal text-slate-400">· {t('avatars.petFramingCustom')}</span>}
      </summary>
      {open && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <PetFramePreview modelPath={path} framing={framing} />
          <div className="min-w-48 flex-1 space-y-3">
            <p className="text-xs text-slate-400">{t('avatars.petFramingHint')}</p>
            <label className="block space-y-1">
              <span className="flex justify-between text-xs text-slate-300">
                {t('avatars.petFramingZoom')}
                <span className="font-mono text-slate-400">{Math.round(framing.zoom * 100)} %</span>
              </span>
              <input
                type="range"
                min={PET_ZOOM_RANGE[0]}
                max={PET_ZOOM_RANGE[1]}
                step={0.05}
                value={framing.zoom}
                onChange={(e) => change({ ...framing, zoom: Number(e.target.value) })}
                className="w-full accent-accent-500"
                data-pet-framing-zoom
              />
            </label>
            <label className="block space-y-1">
              <span className="flex justify-between text-xs text-slate-300">
                {t('avatars.petFramingLift')}
                <span className="font-mono text-slate-400">
                  {framing.lift > 0 ? '+' : ''}
                  {Math.round(framing.lift * 100)} %
                </span>
              </span>
              <input
                type="range"
                min={PET_LIFT_RANGE[0]}
                max={PET_LIFT_RANGE[1]}
                step={0.01}
                value={framing.lift}
                onChange={(e) => change({ ...framing, lift: Number(e.target.value) })}
                className="w-full accent-accent-500"
                data-pet-framing-lift
              />
            </label>
            <button
              type="button"
              disabled={isDefault}
              onClick={() => change({ ...DEFAULT_PET_FRAMING })}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('avatars.petFramingReset')}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
