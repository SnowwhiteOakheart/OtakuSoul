import { useEffect, useState } from 'react';
import type React from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { Eye, EyeOff, Keyboard, MousePointerClick, Move, Menu, Settings2, Tv } from 'lucide-react';
import { Toggle } from '../../ui/Toggle';
import { AvatarPreview } from '../../avatars/AvatarPreview';
import { petModels } from '../../../hooks/useDesktopPetBridge';
import {
  loadPetPlacement,
  loadPetPrefs,
  PET_LABEL,
  PET_PREFS_EVENT,
  PET_RESIZE_EVENT,
  PET_SIZES,
  petModelPath,
  savePetPlacement,
  savePetPrefs,
  type PetFigureChoice,
  type PetPrefs,
  type PetSize,
} from '../../../services/desktopPet';

const SIZES: PetSize[] = ['small', 'medium', 'large'];
const SIZE_LABELS = { small: 'pet.sizeSmall', medium: 'pet.sizeMedium', large: 'pet.sizeLarge' } as const;
const FIGURES: PetFigureChoice[] = ['chat', '3d', 'inochi2d'];
const FIGURE_LABELS = { chat: 'pet.figureChat', '3d': 'pet.figure3d', inochi2d: 'pet.figureInochi2d' } as const;

/**
 * Opens the desktop pet (the active avatar on the desktop), explains how to handle it and holds
 * the same switches as its right-click menu; changes reach an open pet at once.
 */
export const DesktopPetTab: React.FC = () => {
  const { t } = useTranslation();
  const store = useStoreFields(
    'toggleDesktopPet',
    'companionState',
    'activeCharacter',
    'scannedVrms',
    'activeVrmPath',
    'scannedInochi2ds',
    'activeInochi2dPath',
    'avatarMode',
  );
  const { toggleDesktopPet, companionState } = store;
  const open = !!companionState?.overlay_active;
  const [prefs, setPrefs] = useState<PetPrefs>(loadPetPrefs);
  const [size, setSize] = useState<PetSize>(() => loadPetPlacement().size);

  // Changes in the pet's own menu show up here.
  useEffect(() => {
    const stop = listen<PetPrefs>(PET_PREFS_EVENT, ({ payload }) => setPrefs(payload));
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const update = (change: Partial<PetPrefs>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    savePetPrefs(next);
    void emitTo(PET_LABEL, PET_PREFS_EVENT, next).catch(() => {});
  };

  const pickSize = (next: PetSize) => {
    setSize(next);
    // An open pet resizes itself (feet stay where they stood) and saves the size.
    if (open) void emitTo(PET_LABEL, PET_RESIZE_EVENT, next).catch(() => {});
    else savePetPlacement({ size: next });
  };

  const models = petModels(store);
  const previewPath = petModelPath(models, prefs.figure);
  const figureAvailable: Record<PetFigureChoice, boolean> = { chat: true, '3d': !!models.vrmPath, inochi2d: !!models.inochi2dPath };

  const hints = [
    { icon: Move, text: t('pet.hintDrag') },
    { icon: MousePointerClick, text: t('pet.hintClick') },
    { icon: Menu, text: t('pet.hintMenu') },
    { icon: Eye, text: t('pet.hintClickThrough') },
    { icon: Keyboard, text: t('pet.hintShortcut') },
  ];

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? 'border-accent-400 bg-accent-600 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
    }`;

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-5">
      <div className="border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Tv className="w-4 h-4 text-blue-400" />
          {t('pet.tabTitle')}
        </h3>
        <p className="text-xs text-slate-400">{t('pet.tabIntro')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          id="setting-desktop-pet"
          onClick={() => void toggleDesktopPet(!open)}
          aria-pressed={open}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5"
        >
          {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {t(open ? 'pet.hide' : 'pet.show')}
        </button>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4" aria-labelledby="pet-settings-title">
        <div className="space-y-4">
          <h4 id="pet-settings-title" className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" aria-hidden />
            {t('pet.settingsTitle')}
          </h4>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">{t('pet.figure')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('pet.figure')}>
              {FIGURES.map((figure) => (
                <button
                  key={figure}
                  type="button"
                  disabled={!figureAvailable[figure]}
                  aria-pressed={prefs.figure === figure}
                  onClick={() => update({ figure })}
                  className={chip(prefs.figure === figure)}
                >
                  {t(FIGURE_LABELS[figure])}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">{t('pet.size')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('pet.size')}>
              {SIZES.map((key) => (
                <button key={key} type="button" aria-pressed={size === key} onClick={() => pickSize(key)} className={chip(size === key)}>
                  {t(SIZE_LABELS[key])}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-app p-1">
            <Toggle id="pet-idle-actions" label={t('pet.idleActions')} checked={prefs.idleActions} onCheckedChange={(idleActions) => update({ idleActions })} />
            <Toggle id="pet-chat-bubbles" label={t('pet.chatBubbles')} checked={prefs.chatBubbles} onCheckedChange={(chatBubbles) => update({ chatBubbles })} />
            <Toggle id="pet-physics" label={t('pet.physics')} checked={prefs.physics} onCheckedChange={(physics) => update({ physics })} />
            <Toggle
              id="pet-ride-windows"
              label={t('pet.rideWindows')}
              checked={prefs.rideWindows}
              disabled={!prefs.physics}
              onCheckedChange={(rideWindows) => update({ rideWindows })}
            />
            <Toggle
              id="pet-hide-fullscreen"
              label={t('pet.hideInFullscreen')}
              checked={prefs.hideInFullscreen}
              onCheckedChange={(hideInFullscreen) => update({ hideInFullscreen })}
            />
          </div>
        </div>

        <figure className="space-y-1.5">
          <figcaption className="text-xs font-semibold text-slate-300">{t('pet.preview')}</figcaption>
          {/* The pet window's proportions (all sizes share them), at its small size. */}
          <div className="rounded-xl border border-slate-800 bg-app overflow-hidden" style={PET_SIZES.small} data-pet-preview>

            {previewPath ? (
              <AvatarPreview key={previewPath} kind={/\.(inp|inx)$/i.test(previewPath) ? 'inochi2d' : 'vrm'} path={previewPath} />
            ) : (
              <p className="p-3 text-center text-xs text-slate-400">{t('pet.noModel')}</p>
            )}
          </div>
        </figure>
      </section>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hints.map(({ icon: Icon, text }) => (
          <li key={text} className="p-3 rounded-xl bg-app border border-slate-800 flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
            <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-400" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{t('pet.platformNote')}</p>
    </div>
  );
};
