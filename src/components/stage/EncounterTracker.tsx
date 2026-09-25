import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Swords, Shield, Heart, Zap, SkipForward, Play, Square, Plus } from 'lucide-react';

export const EncounterTracker: React.FC = () => {
  const {
    stageState,
    startEncounter,
    endEncounter,
    nextEncounterTurn,
    applyCombatantDelta,
    addCombatantCondition,
  } = useAppStore();

  const encounter = stageState?.encounter;
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [newCondName, setNewCondName] = useState('Gelähmt');
  const [newCondRounds, setNewCondRounds] = useState(2);
  const [showCondModal, setShowCondModal] = useState(false);

  if (!encounter) return null;

  const handleAddCondition = () => {
    if (!selectedCombatantId || !newCondName.trim()) return;
    addCombatantCondition(selectedCombatantId, {
      name: newCondName.trim(),
      rounds_remaining: newCondRounds,
    });
    setShowCondModal(false);
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Taktischer Kampfmodus
              {encounter.is_active && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-500/50 text-rose-300 text-[11px] animate-pulse">
                  Runde {encounter.round}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Initiativleiste, Hitpoints, Stress & Statuszustände
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {encounter.is_active ? (
            <>
              <button
                onClick={() => nextEncounterTurn()}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition active:scale-95"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Nächster Zug
              </button>
              <button
                onClick={() => endEncounter()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold flex items-center gap-1.5 border border-rose-500/30 transition"
              >
                <Square className="w-3.5 h-3.5" />
                Kampf beenden
              </button>
            </>
          ) : (
            <button
              onClick={() => startEncounter()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/30 transition active:scale-95"
            >
              <Play className="w-4 h-4 fill-white" />
              Kampfbegegnung starten
            </button>
          )}
        </div>
      </div>

      {/* Combatants List */}
      <div className="space-y-2.5">
        {encounter.combatants.map((c, idx) => {
          const isCurrentTurn = encounter.is_active && encounter.current_turn_index === idx;
          const hpPercent = Math.round((c.hp / c.max_hp) * 100);
          const stressPercent = Math.round((c.stress / c.max_stress) * 100);

          const roleBadgeColor =
            c.role === 'player'
              ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
              : c.role === 'companion'
              ? 'bg-purple-950 text-purple-300 border-purple-500/40'
              : c.role === 'boss'
              ? 'bg-amber-950 text-amber-300 border-amber-500/40 font-bold'
              : 'bg-rose-950 text-rose-300 border-rose-500/40';

          return (
            <div
              key={c.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isCurrentTurn
                  ? 'bg-purple-950/30 border-purple-500/80 shadow-md shadow-purple-950/40 ring-1 ring-purple-500/50'
                  : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {isCurrentTurn && (
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                  )}
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    {c.name}
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${roleBadgeColor}`}
                    >
                      {c.role}
                    </span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    Ini: <strong>{c.initiative}</strong>
                  </span>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    onClick={() => applyCombatantDelta(c.id, -5, 0)}
                    title="5 Schaden zufügen"
                    className="px-2 py-0.5 rounded bg-rose-900/40 hover:bg-rose-800 text-rose-300 border border-rose-700/50 font-mono text-[11px]"
                  >
                    -5 HP
                  </button>
                  <button
                    onClick={() => applyCombatantDelta(c.id, 5, 0)}
                    title="5 HP heilen"
                    className="px-2 py-0.5 rounded bg-emerald-900/40 hover:bg-emerald-800 text-emerald-300 border border-emerald-700/50 font-mono text-[11px]"
                  >
                    +5 HP
                  </button>
                  <button
                    onClick={() => applyCombatantDelta(c.id, 0, 10)}
                    title="10 Stress hinzufügen"
                    className="px-2 py-0.5 rounded bg-amber-900/40 hover:bg-amber-800 text-amber-300 border border-amber-700/50 font-mono text-[11px]"
                  >
                    +10 Stress
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCombatantId(c.id);
                      setShowCondModal(true);
                    }}
                    title="Zustand hinzufügen"
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[11px] flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Zustand
                  </button>
                </div>
              </div>

              {/* Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* HP */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-rose-400 fill-rose-400/40" />
                      Trefferpunkte (HP)
                    </span>
                    <span className="font-mono text-slate-200">
                      {c.hp} / {c.max_hp}
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        hpPercent < 25
                          ? 'bg-rose-600'
                          : hpPercent < 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(0, hpPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Stress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-cyan-400" />
                      Stress / Willenskraft
                    </span>
                    <span className="font-mono text-slate-200">
                      {c.stress} / {c.max_stress}
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, stressPercent)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Conditions */}
              {c.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-900">
                  {c.conditions.map((cond, cIdx) => (
                    <span
                      key={cIdx}
                      className="px-2 py-0.5 rounded bg-purple-900/40 border border-purple-500/30 text-purple-300 text-[10px] font-medium flex items-center gap-1"
                    >
                      <Shield className="w-3 h-3 text-purple-400" />
                      {cond.name} ({cond.rounds_remaining} Rd.)
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Combat Log */}
      {encounter.combat_log.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Kampfprotokoll
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 text-xs font-mono text-slate-300">
            {encounter.combat_log
              .slice(-5)
              .reverse()
              .map((log, idx) => (
                <div key={idx} className="leading-snug text-slate-400">
                  ➔ {log}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Add Condition Modal */}
      {showCondModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-100">Zustand hinzufügen</h4>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Name des Zustands</label>
              <input
                type="text"
                value={newCondName}
                onChange={(e) => setNewCondName(e.target.value)}
                placeholder="Vergiftet, Gelähmt, Gesegnet..."
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Dauer (Runden)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={newCondRounds}
                onChange={(e) => setNewCondRounds(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCondModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddCondition}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
