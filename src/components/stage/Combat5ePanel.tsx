import React from 'react';
import { Loader2, Shield, Swords } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { combatAwaitsEngine } from '../../store/slices/stageSlice';
import { useTranslation, type TranslationKey } from '../../i18n';
import { combatEventText, localizedName, tierLabel } from '../../utils/combatEvents';
import type { Combatant } from '../../types';
import { Combat5eSpells } from './Combat5eSpells';

/** Lines of the fight log shown under the actions. */
const LOG_LINES = 8;

const isParty = (c: Combatant) => c.role === 'player' || c.role === 'companion';
const isUp = (c: Combatant) => c.hp > 0 && !c.conditions.some((condition) => condition.name === 'fled');
const tierOf = (c: Combatant) =>
  c.hp <= 0 ? 'down' : c.hp >= c.max_hp ? 'unhurt' : c.hp * 2 > c.max_hp ? 'wounded' : 'badly_wounded';

/**
 * A running fight in a 5e scene: initiative order, the actions of whoever the player commands
 * and the latest events. Every number comes from the rules engine; enemies show only how hurt
 * they look.
 */
export const Combat5ePanel: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, runStageCombat, isProcessingStageTurn, appLanguage, stageCombatOptions } = useStoreFields(
    'stageState', 'runStageCombat', 'isProcessingStageTurn', 'appLanguage', 'stageCombatOptions',
  );
  if (!stageState || stageState.definition.rules?.ruleset !== '5e' || !stageState.combat.is_active) return null;

  const combat = stageState.combat;
  const actor = combat.combatants[combat.current_turn_index];
  const waiting = combatAwaitsEngine(stageState);
  const enemies = combat.combatants.filter((c) => !isParty(c) && isUp(c));
  const attacks = actor?.stats5e?.attacks ?? [];
  // On a board only the engine's options count (reach, sight); without one every attack works.
  const onBoard = !!stageState.map;
  const options = stageCombatOptions;
  const optionFor = (id: string) => (onBoard ? options?.actions.find((o) => o.id === id) : { id, disadvantage: false });
  const actionUsed = onBoard && !!options?.action_used;
  const board = (action: string, label: string, hint: string) => (
    <button
      type="button"
      disabled={isProcessingStageTurn || (action !== 'end_turn' && actionUsed)}
      onClick={() => void runStageCombat(action)}
      title={hint}
      className="rounded-lg border border-slate-600 bg-slate-800/60 px-2 py-1 font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40"
    >
      {label}
    </button>
  );
  const log = (combat.events ?? [])
    .map((event) => combatEventText(event, appLanguage))
    .filter((line): line is string => !!line)
    .slice(-LOG_LINES);

  return (
    <section
      aria-label={t('fight.title')}
      data-testid="combat-5e"
      data-busy={isProcessingStageTurn}
      className="mx-4 my-2 rounded-2xl border border-rose-500/30 bg-slate-900/90 p-3 space-y-3 text-xs shadow-xl"
    >
      <header className="flex items-center gap-2 text-sm font-bold text-slate-100">
        <Swords className="w-4 h-4 text-rose-400" />
        {t('fight.title')}
        <span className="rounded-full border border-rose-500/50 bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
          {t('stage.round', { round: combat.round })}
        </span>
        {combat.difficulty && (
          <span data-testid="fight-difficulty" title={t('fight.difficultyHint')} className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-300">
            {t(`fight.difficulty.${combat.difficulty}` as TranslationKey)}
          </span>
        )}
      </header>

      <ol aria-label={t('fight.order')} className="flex flex-wrap gap-1.5">
        {combat.combatants.map((c, index) => (
          <li
            key={c.id}
            aria-current={index === combat.current_turn_index ? 'step' : undefined}
            className={`rounded-lg border px-2 py-1 ${
              index === combat.current_turn_index
                ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                : isParty(c)
                  ? 'border-accent-500/30 bg-accent-950/30 text-slate-200'
                  : 'border-rose-500/30 bg-rose-950/30 text-slate-200'
            } ${isUp(c) ? '' : 'opacity-40 line-through'}`}
          >
            <span className="font-semibold">{c.name}</span>{' '}
            <span className="text-slate-400">
              {isParty(c) ? t('fight.hp', { current: c.hp, max: c.max_hp }) : tierLabel(tierOf(c))}
            </span>
          </li>
        ))}
      </ol>

      {actor && !waiting ? (
        <div className="space-y-2">
          <p className="font-semibold text-amber-200">{t('fight.yourTurn', { name: actor.name })}</p>
          {onBoard && options && (
            <p className="text-slate-400" data-testid="turn-budget">
              {t('board.budget', { feet: options.movement_left_ft })}
              {actionUsed && <> · {t('board.actionUsed')}</>}
              {options.bonus_action_used && <> · {t('fight.bonusUsed')}</>}
            </p>
          )}
          {enemies.map((enemy) => (
            <div key={enemy.id} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-28 text-slate-300">
                {enemy.name} <span className="text-slate-500">({tierLabel(tierOf(enemy))})</span>
              </span>
              {attacks.map((attack) => {
                const option = optionFor(`attack:${attack.id}:${enemy.id}`);
                return (
                  <button
                    key={attack.id}
                    type="button"
                    disabled={isProcessingStageTurn || !option}
                    onClick={() => void runStageCombat(`attack:${attack.id}:${enemy.id}`)}
                    title={option
                      ? t('fight.attackHint', { toHit: attack.to_hit >= 0 ? `+${attack.to_hit}` : attack.to_hit, damage: attack.damage })
                      : t(actionUsed ? 'board.actionUsed' : 'board.outOfReach')}
                    aria-label={t('fight.attackOn', { attack: localizedName(attack.name, appLanguage), target: enemy.name })}
                    className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-900 disabled:opacity-40"
                  >
                    {localizedName(attack.name, appLanguage)}
                    <span className="ml-1 font-normal text-rose-300/80">
                      {attack.to_hit >= 0 ? `+${attack.to_hit}` : attack.to_hit} · {attack.damage}
                    </span>
                    {option?.disadvantage && <span className="ml-1 text-amber-300">({t('fight.disadvantage')})</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {actor.stats5e?.spellcasting && (options?.spells.length ?? 0) > 0 && (
            <Combat5eSpells actor={actor} spells={options!.spells} combatants={combat.combatants} disabled={isProcessingStageTurn} />
          )}
          {(options?.features.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="class-features">
              {options!.features.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  data-feature={feature.id}
                  disabled={isProcessingStageTurn}
                  onClick={() => void runStageCombat(`feature:${feature.id}`)}
                  title={t(`fight.featureHint.${feature.id}` as TranslationKey)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 font-semibold text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-40"
                >
                  {t(`fight.feature.${feature.id}` as TranslationKey)}
                  <span className="ml-1 font-normal text-emerald-300/70">
                    ({t(`fight.cost.${feature.cost}` as TranslationKey)}{feature.uses_left != null ? ` · ${feature.uses_left}×` : ''})
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={isProcessingStageTurn || actionUsed}
              onClick={() => void runStageCombat('dodge')}
              title={t('fight.dodgeHint')}
              className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-2 py-1 font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-40"
            >
              <Shield className="w-3.5 h-3.5" /> {t('fight.dodge')}
            </button>
            {onBoard && (
              <>
                {board('dash', t('board.dash'), t('board.dashHint'))}
                {board('disengage', t('board.disengage'), t('board.disengageHint'))}
                {board('end_turn', t('board.endTurn'), t('board.endTurnHint'))}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-slate-300">
          {isProcessingStageTurn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('fight.othersTurn', { name: actor?.name ?? '' })}
          {!isProcessingStageTurn && (
            <button
              type="button"
              onClick={() => void runStageCombat()}
              className="rounded-lg border border-slate-600 px-2 py-1 font-semibold text-slate-100 hover:bg-slate-800"
            >
              {t('fight.continue')}
            </button>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div aria-label={t('fight.log')} aria-live="polite" className="max-h-40 overflow-y-auto rounded-lg bg-app/60 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
          {log.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
      )}
    </section>
  );
};
