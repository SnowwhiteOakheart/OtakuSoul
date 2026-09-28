import type React from 'react';
import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Eye,
  Tv,
} from 'lucide-react';

export const DesktopOverlayTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    toggleCompanionOverlay,
  } = useStoreFields(
    'toggleCompanionOverlay',
  );

  const [overlayClickThrough, setOverlayClickThrough] = useState<boolean>(false);

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-5">
      <div className="border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Tv className="w-4 h-4 text-blue-400" />
          {t('comp.overlayTitle')}
        </h3>
        <p className="text-xs text-slate-400">
          {t('comp.overlayIntro')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-app border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-200">{t('comp.overlayControl')}</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('comp.overlayText')}
          </p>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => toggleCompanionOverlay(true, overlayClickThrough)}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              {t('comp.overlayStart')}
            </button>
            <button
              onClick={() => toggleCompanionOverlay(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-app border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-200">{t('comp.clickThrough')}</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('comp.clickThroughText')}
          </p>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 pt-2">
            <input
              type="checkbox"
              checked={overlayClickThrough}
              onChange={(e) => {
                const checked = e.target.checked;
                setOverlayClickThrough(checked);
                toggleCompanionOverlay(true, checked);
              }}
              className="rounded border-slate-700 text-cyan-600 focus:ring-0"
            />
            <span>{t('comp.clickThroughToggle')}</span>
          </label>
        </div>
      </div>
    </div>
  );
};
