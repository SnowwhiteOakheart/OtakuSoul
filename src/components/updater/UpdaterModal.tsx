import React, { useState, useEffect } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  X,
  RefreshCw,
  Sparkles,
  Download,
  CheckCircle2,
  Package,
  Calendar,
} from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';

export const UpdaterModal: React.FC = () => {
  const { isUpdaterOpen, setIsUpdaterOpen, updateInfo, checkForUpdates } = useStoreFields(
    'isUpdaterOpen', 'setIsUpdaterOpen', 'updateInfo', 'checkForUpdates',
  );
  const { t, currentLanguage } = useTranslation();

  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    await checkForUpdates();
    setIsChecking(false);
  };

  useEffect(() => {
    if (isUpdaterOpen && !updateInfo) {
      handleCheck();
    }
  }, [isUpdaterOpen]);

  if (!isUpdaterOpen) return null;

  const handleOpenReleaseUrl = async () => {
    const url = updateInfo?.release_url || 'https://github.com/SnowwhiteOakheart/OtakuSoul/releases';
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const hasUpdate = updateInfo?.has_update || false;

  return (
    <ModalOverlay onClose={() => setIsUpdaterOpen(false)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-600/20 border border-accent-500/40 flex items-center justify-center text-accent-400 shadow-md">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{t('updater.title')}</h2>
              <p className="text-xs text-slate-400">{t('updater.subtitle')}</p>
            </div>
          </div>

          <button
            onClick={() => setIsUpdaterOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-sm">
          {/* Status Card */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3.5 transition ${
              hasUpdate
                ? 'bg-accent-950/30 border-accent-500/40'
                : 'bg-emerald-950/20 border-emerald-500/30'
            }`}
          >
            {hasUpdate ? (
              <Sparkles className="w-6 h-6 text-accent-400 shrink-0 mt-0.5 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {hasUpdate ? t('updater.updateAvailable') : t('updater.upToDate')}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {hasUpdate
                  ? `Eine neuere Version von OtakuSoul (${updateInfo?.latest_version}) steht zum Download bereit!`
                  : `Du verwendest bereits die aktuellste Version von OtakuSoul (v0.1.0).`}
              </p>
            </div>
          </div>

          {/* Versions Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-app border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
                {t('updater.current')}
              </span>
              <span className="font-mono text-sm font-bold text-slate-200">
                v{updateInfo?.current_version || '0.1.0'}
              </span>
            </div>

            <div className="bg-app border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
                {t('updater.latest')}
              </span>
              <span className="font-mono text-sm font-bold text-accent-300">
                v{updateInfo?.latest_version || '0.1.0'}
              </span>
            </div>
          </div>

          {/* Release Notes */}
          {updateInfo?.release_notes && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400 block">
                {t('updater.releaseNotes')}:
              </span>
              <div className="bg-app border border-slate-800 rounded-xl p-3.5 max-h-40 overflow-y-auto text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                {updateInfo.release_notes}
              </div>
            </div>
          )}

          {updateInfo?.published_at && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('updater.publishedOn', { date: new Date(updateInfo.published_at).toLocaleDateString(currentLanguage) })}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-app/70 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? t('updater.checking') : t('updater.checkAgain')}</span>
          </button>

          {hasUpdate ? (
            <button
              onClick={handleOpenReleaseUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium shadow-md shadow-accent-600/30 transition"
            >
              <Download className="w-4 h-4" />
              <span>{t('updater.openDownload')}</span>
            </button>
          ) : (
            <button
              onClick={() => setIsUpdaterOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
