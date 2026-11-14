import type React from 'react';
import { Brain, Camera, Clipboard, Flame, Heart, MessageCircle, Moon, Smile, X, Zap } from 'lucide-react';
import type { TranslationKey } from '../../../i18n';
import type { CompanionState } from '../../../types/generated/CompanionState';
import { bondProgress } from '../petBond';

interface PetStatusCardProps {
  characterName?: string;
  emotion: string;
  bubble: string | null;
  thought?: string;
  hormones?: CompanionState['hormones'];
  /** The bond with the user and its needs right now (null for the guest). */
  bond?: { points: number; days: number; hunger: number; boredom: number } | null;
  onClose: () => void;
  onCompose: () => void;
  onPat: () => void;
  onAskTool: (tool: 'take_screenshot' | 'read_clipboard') => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  tEmotion: (emotion: string) => string;
  tOptional: (key: string, fallback: string) => string;
}

export const PetStatusCard: React.FC<PetStatusCardProps> = ({
  characterName,
  emotion,
  bubble,
  thought,
  hormones,
  bond = null,
  onClose,
  onCompose,
  onPat,
  onAskTool,
  t,
  tEmotion,
  tOptional,
}) => (
  <div
    data-pet-solid
    className="absolute top-2 inset-x-2 rounded-2xl bg-app/90 border border-accent-500/40 p-3 space-y-2 text-xs shadow-xl"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-accent-300 truncate">{characterName}</span>
      <button
        onClick={onClose}
        title={t('pet.hideStatus')}
        aria-label={t('pet.hideStatus')}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    <p className="text-slate-300">
      {t('pet.feeling')} <strong>{tEmotion(emotion)}</strong>
      {hormones?.mood_label ? ` • ${tOptional(`mood.${hormones.mood_label}`, hormones.mood_label)}` : ''}
    </p>
    {bubble && <p className="italic text-slate-200">{bubble}</p>}
    {bond && <BondView bond={bond} t={t} />}
    {thought && (
      <p className="flex items-start gap-1.5 text-slate-400">
        <Brain className="mt-0.5 w-3 h-3 shrink-0" aria-hidden />
        <em>{thought}</em>
      </p>
    )}
    {hormones && (
      <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
        <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-amber-300" title={t('comp.dopamine')}>
          <Zap className="w-3 h-3" aria-hidden />
          {Math.round(hormones.dopamine)}%
        </span>
        <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-rose-300" title={t('comp.cortisol')}>
          <Flame className="w-3 h-3" aria-hidden />
          {Math.round(hormones.cortisol)}%
        </span>
        <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-accent2-300" title={t('comp.oxytocin')}>
          <Heart className="w-3 h-3" aria-hidden />
          {Math.round(hormones.oxytocin)}%
        </span>
        <span className="flex flex-col items-center rounded-lg bg-slate-900/90 p-1 text-indigo-300" title={t('comp.fatigue')}>
          <Moon className="w-3 h-3" aria-hidden />
          {Math.round(hormones.fatigue)}%
        </span>
      </div>
    )}
    <div className="grid grid-cols-4 gap-1.5">
      <button
        onClick={onCompose}
        title={t('pet.compose')}
        aria-label={t('pet.compose')}
        className="flex items-center justify-center rounded-xl border border-accent-500/30 bg-accent-950/40 py-1.5 text-accent-300 hover:bg-accent-900/50"
      >
        <MessageCircle className="w-3 h-3" aria-hidden />
      </button>
      <button
        onClick={onPat}
        className="flex items-center justify-center gap-1 rounded-xl border border-accent2-500/30 bg-accent2-950/40 py-1.5 text-accent2-300 hover:bg-accent2-900/50"
      >
        <Smile className="w-3 h-3" aria-hidden />
        {t('pet.pat')}
      </button>
      <button
        onClick={() => onAskTool('take_screenshot')}
        title={t('pet.lookAtScreen')}
        aria-label={t('pet.lookAtScreen')}
        className="flex items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-950/40 py-1.5 text-cyan-300 hover:bg-cyan-900/50"
      >
        <Camera className="w-3 h-3" aria-hidden />
      </button>
      <button
        onClick={() => onAskTool('read_clipboard')}
        title={t('pet.readClipboard')}
        aria-label={t('pet.readClipboard')}
        className="flex items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/40 py-1.5 text-indigo-300 hover:bg-indigo-900/50"
      >
        <Clipboard className="w-3 h-3" aria-hidden />
      </button>
    </div>
  </div>
);

/** The bond's level with a bar to the next one, the days together, and hunger and boredom. */
function BondView({
  bond,
  t,
}: {
  bond: { points: number; days: number; hunger: number; boredom: number };
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const { level, share } = bondProgress(bond.points);
  const bar = (value: number, color: string, label: string) => (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <div
        className="h-1.5 flex-1 rounded-full bg-slate-800"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
  return (
    <div className="space-y-1" data-pet-bond={level}>
      <p className="text-slate-300">
        <Heart className="mr-1 inline w-3 h-3 text-pink-400" aria-hidden />
        {t(`pet.bondTitle${level}` as TranslationKey)} • {t('pet.bondDays', { days: bond.days })}
      </p>
      {bar(share, 'bg-pink-400', t('pet.bondLevel', { level }))}
      {bar(bond.hunger, 'bg-amber-400', t('pet.needHunger'))}
      {bar(bond.boredom, 'bg-sky-400', t('pet.needBoredom'))}
    </div>
  );
}
