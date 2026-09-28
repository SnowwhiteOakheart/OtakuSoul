import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { ArrowRight, Swords, Shield, Heart, Zap, SkipForward, Play, Square, Plus, Crosshair, Wind, DoorOpen, Hourglass } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation, type TranslationKey } from '../../i18n';

export const EncounterTracker: React.FC = () => {
  const { t } = useTranslation();
  const {
    stageState,
    startEncounter,
    endEncounter,
    nextEncounterTurn,
    applyCombatantDelta,
    addCombatantCondition,
    runStageTurn,
    delayEncounterTurn,
    isProcessingStageTurn,
  } = useStoreFields(
    'stageState', 'startEncounter', 'endEncounter', 'nextEncounterTurn', 'applyCombatantDelta',
    'addCombatantCondition', 'runStageTurn', 'delayEncounterTurn', 'isProcessingStageTurn',
  );

  const encounter = stageState?.combat;
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [newCondName, setNewCondName] = useState(() => translate('stage.conditionDefault'));
  const [newCondRounds, setNewCondRounds] = useState(2);
  const [showCondModal, setShowCondModal] = useState(false);

  if (!encounter) return null;
  const isPlayerTurn = encounter.is_active
    && encounter.combatants[encounter.current_turn_index]?.role === 'player';

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
              {t('stage.combatTitle')}
              {encounter.is_active && (
                <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-500/50 text-rose-300 text-xs animate-pulse motion-reduce:animate-none">
                  {t('stage.round', { round: encounter.round })}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">{t('stage.combatIntro')}</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {encounter.is_active ? (
            <>
              <button
                onClick={() => runStageTurn(translate('stage.attackAction'), 'do')}
                disabled={isProcessingStageTurn}
                className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-200 text-xs font-semibold flex items-center gap-1 border border-rose-500/30 disabled:opacity-40"
              >
                <Crosshair className="w-3.5 h-3.5" /> {t('stage.attack')}
              </button>
              <button
                onClick={() => runStageTurn(translate('stage.dodgeAction'), 'do')}
                disabled={isProcessingStageTurn}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 text-cyan-200 text-xs font-semibold flex items-center gap-1 border border-cyan-500/30 disabled:opacity-40"
              >
                <Wind className="w-3.5 h-3.5" /> {t('stage.dodge')}
              </button>
              <button
                onClick={() => runStageTurn(translate('stage.fleeAction'), 'do')}
                disabled={isProcessingStageTurn}
                className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-200 text-xs font-semibold flex items-center gap-1 border border-amber-500/30 disabled:opacity-40"
              >
                <DoorOpen className="w-3.5 h-3.5" /> {t('stage.flee')}
              </button>
              {isPlayerTurn && (
                <button
                  onClick={() => delayEncounterTurn()}
                  disabled={isProcessingStageTurn}
                  title={t('stage.delayHint')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 border border-slate-600 disabled:opacity-40"
                >
                  <Hourglass className="w-3.5 h-3.5" /> {t('stage.delay')}
                </button>
              )}
              <button
                onClick={() => nextEncounterTurn()}
                className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition active:scale-95"
              >
                <SkipForward className="w-3.5 h-3.5" />
                {t('stage.nextTurn')}
              </button>
              <button
                onClick={() => endEncounter()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold flex items-center gap-1.5 border border-rose-500/30 transition"
              >
                <Square className="w-3.5 h-3.5" />
                {t('stage.endCombat')}
              </button>
            </>
          ) : (
            <button
              onClick={() => startEncounter()}
              className="px-4 py-2 rounded-xl bg-linear-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/30 transition active:scale-95"
            >
              <Play className="w-4 h-4 fill-white" />
              {t('stage.startCombat')}
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
              ? 'bg-accent-950 text-accent-300 border-accent-500/40'
              : c.role === 'boss'
              ? 'bg-amber-950 text-amber-300 border-amber-500/40 font-bold'
              : 'bg-rose-950 text-rose-300 border-rose-500/40';

          return (
            <div
              key={c.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isCurrentTurn
                  ? 'bg-accent-950/30 border-accent-500/80 shadow-md shadow-accent-950/40 ring-1 ring-accent-500/50'
                  : 'bg-app/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {isCurrentTurn && (
                    <span className="w-2.5 h-2.5 rounded-full bg-accent-400 animate-ping" />
                  )}
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    {c.name}
                    <span
                      className={`text-[11px] uppercase font-mono px-2 py-0.5 rounded-full border ${roleBadgeColor}`}
                    >
                      {t(`stage.role.${c.role}` as TranslationKey)}
                    </span>
                  </h4>
                  <span className="text-xs font-mono text-slate-400">
                    {t('stage.initiative', { value: c.initiative })}
                  </span>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    onClick={() => applyCombatantDelta(c.id, -5, 0)}
                    title={t('stage.damage', { name: c.name })}
                    aria-label={t('stage.damage', { name: c.name })}
                    className="px-2 py-0.5 rounded bg-rose-900/40 hover:bg-rose-800 text-rose-300 border border-rose-700/50 font-mono text-xs"
                  >
                    -5 HP
                  </button>
                  <button
                    onClick={() => applyCombatantDelta(c.id, 5, 0)}
                    title={t('stage.heal', { name: c.name })}
                    aria-label={t('stage.heal', { name: c.name })}
                    className="px-2 py-0.5 rounded bg-emerald-900/40 hover:bg-emerald-800 text-emerald-300 border border-emerald-700/50 font-mono text-xs"
                  >
                    +5 HP
                  </button>
                  <button
                    onClick={() => applyCombatantDelta(c.id, 0, 10)}
                    title={t('stage.addStress', { name: c.name })}
                    aria-label={t('stage.addStress', { name: c.name })}
                    className="px-2 py-0.5 rounded bg-amber-900/40 hover:bg-amber-800 text-amber-300 border border-amber-700/50 font-mono text-xs"
                  >
                    +10 Stress
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCombatantId(c.id);
                      setShowCondModal(true);
                    }}
                    title={t('stage.addConditionFor', { name: c.name })}
                    aria-label={t('stage.addConditionFor', { name: c.name })}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-xs flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> {t('stage.condition')}
                  </button>
                </div>
              </div>

              {/* Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* HP */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-rose-400 fill-rose-400/40" />
                      {t('stage.hitPoints')}
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
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-cyan-400" />
                      {t('stage.stressWill')}
                    </span>
                    <span className="font-mono text-slate-200">
                      {c.stress} / {c.max_stress}
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-linear-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
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
                      className="px-2 py-0.5 rounded bg-accent-900/40 border border-accent-500/30 text-accent-300 text-[11px] font-medium flex items-center gap-1"
                    >
                      <Shield className="w-3 h-3 text-accent-400" />
                      {t('stage.conditionShort', { name: cond.name, rounds: cond.rounds_remaining })}
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
        <div className="p-3 rounded-xl bg-app/80 border border-slate-800 space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('stage.combatLog')}
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 text-xs font-mono text-slate-300">
            {encounter.combat_log
              .slice(-5)
              .reverse()
              .map((log, idx) => (
                <div key={idx} className="flex items-start gap-1 leading-snug text-slate-400">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>{log}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Add Condition Modal */}
      {showCondModal && (
        <ModalOverlay onClose={() => setShowCondModal(false)} aria-labelledby="add-condition-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-3">
            <h4 id="add-condition-title" className="text-xs font-bold text-slate-100">{t('stage.addCondition')}</h4>
            <div>
              <label htmlFor="condition-name" className="text-xs text-slate-400 block mb-1">{t('stage.conditionName')}</label>
              <input
                id="condition-name"
                data-autofocus
                type="text"
                value={newCondName}
                onChange={(e) => setNewCondName(e.target.value)}
                placeholder={t('stage.conditionPlaceholder')}
                className="w-full px-3 py-1.5 bg-app border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-accent-500"
              />
            </div>
            <div>
              <label htmlFor="condition-rounds" className="text-xs text-slate-400 block mb-1">{t('stage.conditionDuration')}</label>
              <input
                id="condition-rounds"
                type="number"
                min={1}
                max={10}
                value={newCondRounds}
                onChange={(e) => setNewCondRounds(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 bg-app border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCondModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAddCondition}
                className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold"
              >
                {t('stage.add')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
};
