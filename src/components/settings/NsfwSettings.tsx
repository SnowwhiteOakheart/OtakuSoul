import { useId, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Toggle } from '../ui/Toggle';
import { ModalOverlay } from '../ui/ModalOverlay';

/**
 * Content for adults: off by default. Turning it on asks once for the confirmation of being at
 * least 18 (no birth date is stored); then the hub also lists the adult content repository and
 * installed adult content shows. The backend checks the same setting itself.
 */
export const NsfwSettings = () => {
  const { t } = useTranslation();
  const { nsfwEnabled, adultConfirmed, setNsfwEnabled } = useStoreFields('nsfwEnabled', 'adultConfirmed', 'setNsfwEnabled');
  const [asking, setAsking] = useState(false);
  const on = nsfwEnabled && adultConfirmed;

  return (
    <div id="setting-nsfw" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          {t('nsfw.title')}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('nsfw.intro')}</p>
      </div>
      <Toggle
        id="setting-nsfw-toggle"
        checked={on}
        onCheckedChange={(next) => {
          if (next && !adultConfirmed) setAsking(true);
          else void setNsfwEnabled(next);
        }}
        label={t('nsfw.toggle')}
        description={t(on ? 'nsfw.on' : 'nsfw.off')}
        className="-mx-2"
      />
      {asking && (
        <AdultConfirmDialog
          onConfirm={() => {
            setAsking(false);
            void setNsfwEnabled(true, true);
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
};

/** One-time confirmation of being an adult before adult content can be turned on. */
const AdultConfirmDialog = ({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <ModalOverlay onClose={onClose} aria-labelledby={`${id}-title`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 shadow-xl space-y-3" data-adult-confirm>
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-slate-100">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          {t('nsfw.confirmTitle')}
        </h2>
        <p className="text-sm text-slate-300">{t('nsfw.confirmText')}</p>
        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          {t('nsfw.confirmAge')}
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={!confirmed}
            className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-40">
            {t('nsfw.confirmButton')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
