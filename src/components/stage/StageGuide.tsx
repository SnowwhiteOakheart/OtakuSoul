import React from 'react';
import { Check, FastForward, MessageSquare, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslation, type TranslationKey } from '../../i18n';

const TIPS: { icon: typeof Sparkles; key: TranslationKey }[] = [
  { icon: MessageSquare, key: 'stageGuide.modes' },
  { icon: Sparkles, key: 'stageGuide.suggestions' },
  { icon: FastForward, key: 'stageGuide.continue' },
  { icon: RotateCcw, key: 'stageGuide.undo' },
];

/** Short guide to playing a Stage story; shown on the first story and again from the help button. */
export const StageGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="stage-guide-title"
      data-stage-guide
      className="rounded-xl border border-accent-500/40 bg-accent-950/40 p-3 sm:p-4 space-y-2"
    >
      <h3 id="stage-guide-title" className="text-sm font-semibold text-accent-100">{t('stageGuide.title')}</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {TIPS.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-2 text-xs text-slate-300">
            <Icon className="w-4 h-4 shrink-0 text-accent-300 mt-0.5" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500"
        >
          <Check className="w-3.5 h-3.5" />
          {t('stageGuide.understood')}
        </button>
      </div>
    </section>
  );
};
