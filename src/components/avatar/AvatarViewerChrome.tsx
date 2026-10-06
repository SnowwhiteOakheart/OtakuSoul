import { Angry, Box, Frown, Loader2, RefreshCcw, RotateCcw, Smile, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation, type TranslationKey } from '../../i18n';

/** Expressions of the quick bar and the emotion each one sets. */
const QUICK_EMOTIONS: { expression: string; emotion: string; label: TranslationKey; icon: ReactNode; active: string }[] = [
  { expression: 'neutral', emotion: 'neutral', label: 'avatar.quickNeutral', icon: <RefreshCcw className="w-3 h-3 inline 2xl:mr-1" />, active: 'bg-accent-600' },
  { expression: 'happy', emotion: 'joy', label: 'avatar.quickHappy', icon: <Smile className="w-3 h-3 inline 2xl:mr-1 text-accent2-300" />, active: 'bg-accent2-600' },
  { expression: 'angry', emotion: 'anger', label: 'avatar.quickAngry', icon: <Angry className="w-3 h-3 inline 2xl:mr-1 text-red-300" />, active: 'bg-red-600' },
  { expression: 'sad', emotion: 'sadness', label: 'avatar.quickSad', icon: <Frown className="w-3 h-3 inline 2xl:mr-1 text-indigo-300" />, active: 'bg-indigo-600' },
  { expression: 'relaxed', emotion: 'relief', label: 'avatar.quickRelaxed', icon: <Sparkles className="w-3 h-3 inline 2xl:mr-1 text-emerald-300" />, active: 'bg-emerald-600' },
];

interface AvatarViewerChromeProps {
  loading: boolean;
  loadingLabel: string;
  error: string | null;
  /** Hint instead of a model (none assigned). */
  empty?: { title: string; text: string } | null;
  /** Current expression; marks its quick button. */
  expression: string;
  onPickEmotion: (emotion: string) => void;
  onResetView: () => void;
}

/** Overlays every 3D viewer shares: loading, error, empty hint, view reset and quick emotions. */
export const AvatarViewerChrome = ({ loading, loadingLabel, error, empty, expression, onPickEmotion, onResetView }: AvatarViewerChromeProps) => {
  const { t } = useTranslation();
  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-app/80 backdrop-blur z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-accent-400 animate-spin" />
          <span className="text-xs text-accent-300 font-mono">{loadingLabel}</span>
        </div>
      )}

      {!loading && !error && empty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 z-10 pointer-events-none">
          <Box className="w-12 h-12 text-accent-400/50 mb-2" />
          <p className="text-sm font-semibold text-slate-200">{empty.title}</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">{empty.text}</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs z-30 font-mono">
          {error}
        </div>
      )}

      <button
        onClick={onResetView}
        className="absolute bottom-4 right-4 z-20 p-2 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-400 hover:text-accent-300 hover:bg-slate-800 backdrop-blur shadow-xl transition-colors"
        title={t('avatar.resetView')}
        aria-label={t('avatar.resetView')}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      <div
        role="group"
        aria-label={t('avatar.quickEmotions')}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur z-20 shadow-xl"
      >
        {QUICK_EMOTIONS.map((quick) => (
          <button
            key={quick.expression}
            title={t(quick.label)}
            aria-label={t(quick.label)}
            onClick={() => onPickEmotion(quick.emotion)}
            aria-pressed={expression === quick.expression}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              expression === quick.expression ? `${quick.active} text-white shadow-sm` : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {quick.icon}
            <span className="hidden 2xl:inline">{t(quick.label)}</span>
          </button>
        ))}
      </div>
    </>
  );
};
