import React from 'react';
import { Loader2, Shield, Swords } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { combatAwaitsEngine } from '../../store/slices/stageSlice';
import { useTranslation } from '../../i18n';
import { combatEventText, localizedName, tierLabel } from '../../utils/combatEvents';
import type { Combatant } from '../../types';

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
  const { stageState, runStageCombat, isProcessingStageTurn, appLanguage } = useStoreFields(
    'stageState', 'runStageCombat', 'isProcessingStageTurn', 'appLanguage',
  );
  if (!stageState || stageState.definition.rules?.ruleset !== '5e' || !stageState.combat.is_active) return null;

  const combat = stageState.combat;
  const actor = combat.combatants[combat.current_turn_index];
  const waiting = combatAwaitsEngine(stageState);
  const enemies = combat.combatants.filter((c) => !isParty(c) && isUp(c));
  const attacks = actor?.stats5e?.attacks ?? [];
  const log = (combat.events ?? [])
    .map((event) => combatEventText(event, appLanguage))
    .filter((line): line is string => !!line)
    .slice(-LOG_LINES);

  return (
    <section
      aria-label={t('fight.title')}
      data-testid="combat-5e"
      className="mx-4 my-2 rounded-2xl border border-rose-500/30 bg-slate-900/90 p-3 space-y-3 text-xs shadow-xl"
    >
      <header className="flex items-center gap-2 text-sm font-bold text-slate-100">
        <Swords className="w-4 h-4 text-rose-400" />
        {t('fight.title')}
        <span className="rounded-full border border-rose-500/50 bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
          {t('stage.round', { round: combat.round })}
        </span>
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
          {enemies.map((enemy) => (
            <div key={enemy.id} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-28 text-slate-300">
                {enemy.name} <span className="text-slate-500">({tierLabel(tierOf(enemy))})</span>
              </span>
              {attacks.map((attack) => (
                <button
                  key={attack.id}
                  type="button"
                  disabled={isProcessingStageTurn}
                  onClick={() => void runStageCombat(`attack:${attack.id}:${enemy.id}`)}
                  title={t('fight.attackHint', { toHit: attack.to_hit >= 0 ? `+${attack.to_hit}` : attack.to_hit, damage: attack.damage })}
                  aria-label={t('fight.attackOn', { attack: localizedName(attack.name, appLanguage), target: enemy.name })}
                  className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-900 disabled:opacity-40"
                >
                  {localizedName(attack.name, appLanguage)}
                  <span className="ml-1 font-normal text-rose-300/80">
                    {attack.to_hit >= 0 ? `+${attack.to_hit}` : attack.to_hit} · {attack.damage}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            disabled={isProcessingStageTurn}
            onClick={() => void runStageCombat('dodge')}
            title={t('fight.dodgeHint')}
            className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-2 py-1 font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-40"
          >
            <Shield className="w-3.5 h-3.5" /> {t('fight.dodge')}
          </button>
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
