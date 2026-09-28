import type React from 'react';
import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Activity,
  Heart,
  Zap,
  Flame,
  Moon,
  Smile,
  Sparkles,
  Sliders,
} from 'lucide-react';

interface HormoneLevels {
  dopamine: number;
  cortisol: number;
  oxytocin: number;
  fatigue: number;
}

export const BioMonitorTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    companionState, applyHormoneInteraction, setHormones,
  } = useStoreFields(
    'companionState', 'applyHormoneInteraction', 'setHormones',
  );

  const hormones = companionState?.hormones;
  // Sliders show the live values until the user moves one; then they edit a draft until applied.
  const [draft, setDraft] = useState<HormoneLevels | null>(null);
  const sliders: HormoneLevels = draft ?? {
    dopamine: Math.round(hormones?.dopamine ?? 65),
    cortisol: Math.round(hormones?.cortisol ?? 20),
    oxytocin: Math.round(hormones?.oxytocin ?? 75),
    fatigue: Math.round(hormones?.fatigue ?? 15),
  };
  const setSlider = (key: keyof HormoneLevels, value: number) => setDraft({ ...sliders, [key]: value });

  const emotion = companionState?.emotion;

  const handleApplySliders = async () => {
    await setHormones(sliders.dopamine, sliders.cortisol, sliders.oxytocin, sliders.fatigue);
    setDraft(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Hormones & Energy */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent2-400" />
              {t('comp.bioTitle')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('comp.bioIntro')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300 px-2 py-0.5 rounded bg-slate-800">
              {t('comp.energyLevel', { value: hormones?.energy_level ?? 0 })}
            </span>
            {hormones && hormones.fatigue >= 95 && (
              <span className="text-xs font-mono text-indigo-300 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-500/40">
                {t('comp.sleeping')}
              </span>
            )}
            {hormones && hormones.oxytocin <= 25 && (
              <span className="text-xs font-mono text-rose-300 px-2 py-0.5 rounded bg-rose-950 border border-rose-500/40">
                {t('comp.lonely')}
              </span>
            )}
          </div>
        </div>

        {/* 4 Hormone Gauges */}
        {hormones && (
          <div className="grid grid-cols-2 gap-3.5">
            {/* Dopamine */}
            <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {t('comp.dopamine')}
                </span>
                <span className="font-mono text-amber-300 font-bold">{Math.round(hormones.dopamine)}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-linear-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${hormones.dopamine}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 block">{t('comp.dopamineHint')}</span>
            </div>

            {/* Cortisol */}
            <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  {t('comp.cortisol')}
                </span>
                <span className="font-mono text-rose-300 font-bold">{Math.round(hormones.cortisol)}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-linear-to-r from-rose-500 to-red-600 rounded-full transition-all duration-500"
                  style={{ width: `${hormones.cortisol}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 block">{t('comp.cortisolHint')}</span>
            </div>

            {/* Oxytocin */}
            <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-accent2-400 fill-accent2-400/40" />
                  {t('comp.oxytocin')}
                </span>
                <span className="font-mono text-accent2-300 font-bold">{Math.round(hormones.oxytocin)}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-linear-to-r from-accent2-500 to-rose-400 rounded-full transition-all duration-500"
                  style={{ width: `${hormones.oxytocin}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 block">{t('comp.oxytocinHint')}</span>
            </div>

            {/* Fatigue */}
            <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  {t('comp.fatigue')}
                </span>
                <span className="font-mono text-indigo-300 font-bold">{Math.round(hormones.fatigue)}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-linear-to-r from-indigo-500 to-accent-500 rounded-full transition-all duration-500"
                  style={{ width: `${hormones.fatigue}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 block">{t('comp.fatigueHint')}</span>
            </div>
          </div>
        )}

        {/* Quick Impulses */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('comp.impulses')}
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => applyHormoneInteraction('compliment')}
              className="px-3 py-1.5 rounded-lg bg-accent2-900/40 hover:bg-accent2-800/50 text-accent2-300 border border-accent2-500/30 flex items-center gap-1.5 transition active:scale-95"
            >
              <Smile className="w-3.5 h-3.5" />
              {t('comp.compliment')}
            </button>
            <button
              onClick={() => applyHormoneInteraction('challenge')}
              className="px-3 py-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition active:scale-95"
            >
              <Zap className="w-3.5 h-3.5" />
              {t('comp.challenge')}
            </button>
            <button
              onClick={() => applyHormoneInteraction('conflict')}
              className="px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/50 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition active:scale-95"
            >
              <Flame className="w-3.5 h-3.5" />
              {t('comp.conflict')}
            </button>
            <button
              onClick={() => applyHormoneInteraction('rest')}
              className="px-3 py-1.5 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition active:scale-95"
            >
              <Moon className="w-3.5 h-3.5" />
              {t('comp.rest')}
            </button>
          </div>
        </div>
      </div>

      {/* Right: 10 Affective Emotions & Sliders */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-400" />
            {t('comp.matrix')}
          </h3>
          <p className="text-xs text-slate-400">
            {t('comp.matrixIntro')}
          </p>
        </div>

        {/* Emotion Badges */}
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'neutral', label: t('comp.emo.neutral') },
            { name: 'curious', label: t('comp.emo.curious') },
            { name: 'warm', label: t('comp.emo.warm') },
            { name: 'amused', label: t('comp.emo.amused') },
            { name: 'concerned', label: t('comp.emo.concerned') },
            { name: 'playful', label: t('comp.emo.playful') },
            { name: 'relaxed', label: t('comp.emo.relaxed') },
            { name: 'sleepy', label: t('comp.emo.sleepy') },
            { name: 'melancholy', label: t('comp.emo.melancholy') },
            { name: 'excited', label: t('comp.emo.excited') },
          ].map((emo) => {
            const isCurrent = emotion?.current === emo.name;
            const score = emotion?.ema_scores?.[emo.name] || 0;
            return (
              <div
                key={emo.name}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition ${
                  isCurrent
                    ? 'bg-accent-900/60 border-accent-500 text-accent-200 shadow-md shadow-accent-950/40 ring-1 ring-accent-400'
                    : 'bg-app/50 border-slate-800 text-slate-400'
                }`}
              >
                <span>{emo.label}</span>
                <span className="font-mono text-[11px] opacity-75">
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Hormone Sliders */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>{t('comp.manual')}</span>
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
          </span>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{t('comp.sliderValue', { name: t('comp.dopamine'), value: sliders.dopamine })}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliders.dopamine}
                onChange={(e) => setSlider('dopamine', parseInt(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{t('comp.sliderValue', { name: t('comp.cortisol'), value: sliders.cortisol })}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliders.cortisol}
                onChange={(e) => setSlider('cortisol', parseInt(e.target.value))}
                className="w-full accent-rose-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{t('comp.sliderValue', { name: t('comp.oxytocin'), value: sliders.oxytocin })}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliders.oxytocin}
                onChange={(e) => setSlider('oxytocin', parseInt(e.target.value))}
                className="w-full accent-accent2-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{t('comp.sliderValue', { name: t('comp.fatigue'), value: sliders.fatigue })}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliders.fatigue}
                onChange={(e) => setSlider('fatigue', parseInt(e.target.value))}
                className="w-full accent-indigo-400"
              />
            </div>
          </div>

          <button
            onClick={handleApplySliders}
            className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            {t('comp.applyLevels')}
          </button>
        </div>
      </div>
    </div>
  );
};
