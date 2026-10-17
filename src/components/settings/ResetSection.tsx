import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { translate, useTranslation } from '../../i18n';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';

interface ResetSectionProps {
  /** Which part of the settings (shown in the toast). */
  area: string;
  /** Values that differ from the defaults. */
  changed: number;
  /** Sets the defaults and returns how to bring the old values back. */
  reset: () => Promise<() => void> | (() => void);
}

/** How many values of a settings area differ from the defaults, and a button back to them (with undo). */
export const ResetSection = ({ area, changed, reset }: ResetSectionProps) => {
  const { t, tPlural } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (changed === 0) {
    return <p className="text-[11px] text-slate-500" data-reset-area={area} data-changed={0}>{t('settings.resetNone')}</p>;
  }
  const run = async () => {
    setBusy(true);
    try {
      const undo = await reset();
      toast.info(translate('settings.resetDone', { area }), { label: translate('common.undo'), onClick: undo });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-reset-area={area} data-changed={changed}>
      <span className="text-amber-300">{tPlural('settings.resetChanged', changed)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('settings.resetButton')}
      </button>
    </div>
  );
};
