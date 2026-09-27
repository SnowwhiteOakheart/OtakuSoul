import React from 'react';
import { StageEventCard } from '../../types';
import { Dices, Clock, Flame, Sparkles, AlertTriangle, CheckCircle2, XCircle, PackageOpen, HeartHandshake, Swords } from 'lucide-react';

interface StageEventCardViewProps {
  card: StageEventCard;
}

export const StageEventCardView: React.FC<StageEventCardViewProps> = ({ card }) => {
  if (card.type === 'dice_roll') {
    const isCrit = card.is_crit_success;
    const isFumble = card.is_crit_fail;
    const hasDc = card.target_dc !== undefined && card.target_dc !== null;

    return (
      <div
        className={`my-2 p-3.5 rounded-xl border backdrop-blur-sm transition-all ${
          isCrit
            ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-950/40'
            : isFumble
            ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/40'
            : hasDc
            ? card.passed
              ? 'bg-blue-950/30 border-blue-500/40'
              : 'bg-amber-950/30 border-amber-500/40'
            : 'bg-accent-950/30 border-accent-500/40'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isCrit
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : isFumble
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-accent-500/20 text-accent-300'
              }`}
            >
              <Dices className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200">Würfelprobe: {card.formula}</span>
            </div>
          </div>

          {/* Result Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-black px-2.5 py-0.5 rounded-lg font-mono ${
                isCrit
                  ? 'bg-emerald-500 text-app ring-2 ring-emerald-300'
                  : isFumble
                  ? 'bg-rose-500 text-white ring-2 ring-rose-300'
                  : 'bg-slate-800 text-accent-300 border border-accent-500/30'
              }`}
            >
              Gesamt: {card.total}
            </span>
          </div>
        </div>

        {/* Dice breakdown & DC */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <span>Würfel:</span>
            <div className="flex gap-1">
              {card.rolls.map((roll, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono font-semibold text-slate-300"
                >
                  {roll}
                </span>
              ))}
            </div>
            {card.modifier !== 0 && (
              <span className="text-slate-400 font-mono">
                {card.modifier > 0 ? `+${card.modifier}` : card.modifier}
              </span>
            )}
          </div>

          {hasDc && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">Schwierigkeit (DC {card.target_dc}):</span>
              {card.passed ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-bold text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Erfolg
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-900/60 border border-rose-500/40 text-rose-300 font-bold text-xs">
                  <XCircle className="w-3 h-3" /> Fehlgeschlagen
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (card.type === 'clock_update') {
    const progressPercent = Math.min(100, Math.round((card.current / card.max) * 100));

    return (
      <div className="my-2 p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 shadow-md">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200">Uhr-Fortschritt: {card.clock_name}</span>
            </div>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              card.delta > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {card.delta > 0 ? `+${card.delta}` : card.delta} Segmente ({card.current}/{card.max})
          </span>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
          <div
            className="bg-linear-to-r from-amber-500 to-rose-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  if (card.type === 'rest') {
    return (
      <div className="my-2 p-3.5 rounded-xl bg-linear-to-r from-amber-950/40 via-orange-950/30 to-slate-900/80 border border-amber-500/40 shadow-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
            <Flame className="w-4 h-4 animate-pulse" />
          </div>
          <span className="text-xs font-bold text-amber-200">
            {card.rest_type === 'long' ? 'Lange Rast vollendet' : 'Kurze Rast am Lager'}
          </span>
        </div>
        <p className="text-xs text-slate-300 mb-2">{card.campfire_note}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-semibold text-xs">
            +{card.recovered_hp} LP regeneriert
          </span>
          <span className="px-2 py-0.5 rounded bg-accent-950/70 border border-accent-500/40 text-accent-300 font-semibold text-xs">
            -{card.recovered_stress} Stress abgebaut
          </span>
        </div>
      </div>
    );
  }

  if (card.type === 'discovery') {
    return (
      <div className="my-2 p-3.5 rounded-xl bg-linear-to-r from-accent-950/40 to-slate-900 border border-accent-500/40 shadow-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1.5 rounded-lg bg-accent-500/20 text-accent-300">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-accent-200">Entdeckung</span>
        </div>
        <p className="text-xs text-slate-300">{card.text}</p>
      </div>
    );
  }

  if (card.type === 'consequence') {
    return (
      <div className="my-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 shadow-md">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-rose-200">Konsequenz</span>
        </div>
        <p className="text-xs text-slate-300">{card.text}</p>
      </div>
    );
  }

  if (card.type === 'item_use') {
    return (
      <div className="my-2 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 shadow-md">
        <div className="flex items-center gap-2 mb-1.5">
          <PackageOpen className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-200">{card.item_name} benutzt</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {card.hp_recovered > 0 && <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200">+{card.hp_recovered} LP</span>}
          {card.stress_recovered > 0 && <span className="px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-200">-{card.stress_recovered} Stress</span>}
          {card.cleared_condition && <span className="px-2 py-0.5 rounded bg-accent-900/60 text-accent-200">{card.cleared_condition} kuriert</span>}
        </div>
      </div>
    );
  }

  if (card.type === 'bond_milestone') {
    return (
      <div className="my-2 p-3.5 rounded-xl bg-linear-to-r from-accent2-950/40 to-accent-950/30 border border-accent2-500/40 shadow-lg">
        <div className="flex items-center gap-2">
          <HeartHandshake className="w-4 h-4 text-accent2-400" />
          <span className="text-xs font-bold text-accent2-200">Bindungs-Meilenstein mit {card.companion}</span>
        </div>
        <p className="text-xs text-slate-300 mt-1">Nähe {card.affinity}/100 · Schwelle {card.milestone} erreicht</p>
      </div>
    );
  }

  if (card.type === 'combat') {
    return (
      <div className="my-2 p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 shadow-md">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-bold text-rose-200">{card.text}</span>
        </div>
      </div>
    );
  }

  return null;
};
