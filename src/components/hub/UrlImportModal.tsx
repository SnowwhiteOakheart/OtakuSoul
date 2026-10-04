import { useState } from 'react';
import { Download, Link as LinkIcon, Loader2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useHubStore } from './hubStore';
import { characterImported } from './hubParts';
import { importWithOverwrite } from '../../services/characterImport';

const IMPORT_ID = 'url-import';

/** Imports a character card from a chub.ai link or a direct PNG URL. */
export const UrlImportModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { importing, runImport } = useHubStore(
    useShallow((s) => ({ importing: s.importingId === IMPORT_ID, runImport: s.runImport }))
  );
  const [url, setUrl] = useState('');

  const handleImport = async () => {
    const target = url.trim();
    if (!target) return;
    const ok = await runImport(IMPORT_ID, async () => {
      const res = await importWithOverwrite((overwrite) => api.importCharacterFromUrl(target, overwrite));
      return res && characterImported(res);
    });
    if (ok) onClose();
  };

  return (
    <ModalOverlay
      onClose={onClose}
      aria-labelledby="url-import-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleImport();
        }}
        className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in zoom-in-95"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LinkIcon className="w-5 h-5 text-cyan-400" />
            <h3 id="url-import-title" className="font-bold text-sm text-slate-100">
              {t('hub.urlTitle')}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400">{t('hub.urlIntro')}</p>

        <input
          type="url"
          data-autofocus
          aria-label={t('hub.urlLabel')}
          placeholder={t('hub.urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-app border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-cyan-500 font-mono"
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={importing || !url.trim()}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900/50 text-app font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{importing ? t('hub.importing') : t('hub.importNow')}</span>
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
};
