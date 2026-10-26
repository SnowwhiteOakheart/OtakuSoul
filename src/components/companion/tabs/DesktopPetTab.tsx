import type React from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { Eye, EyeOff, Keyboard, MousePointerClick, Move, Menu, Tv } from 'lucide-react';

/** Opens the desktop pet (the active avatar on the desktop) and explains how to handle it. */
export const DesktopPetTab: React.FC = () => {
  const { t } = useTranslation();
  const { toggleDesktopPet, companionState } = useStoreFields('toggleDesktopPet', 'companionState');
  const open = !!companionState?.overlay_active;

  const hints = [
    { icon: Move, text: t('pet.hintDrag') },
    { icon: MousePointerClick, text: t('pet.hintClick') },
    { icon: Menu, text: t('pet.hintMenu') },
    { icon: Eye, text: t('pet.hintClickThrough') },
    { icon: Keyboard, text: t('pet.hintShortcut') },
  ];

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
