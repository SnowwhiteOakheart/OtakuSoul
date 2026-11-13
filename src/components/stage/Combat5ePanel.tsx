import React, { useState } from 'react';
import { CircleHelp, Footprints, Loader2, MoreHorizontal, Shield, Sparkles, Swords } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { combatAwaitsEngine } from '../../store/slices/stageSlice';
import { useTranslation, type TranslationKey } from '../../i18n';
import { combatEventText, localizedName, tierLabel } from '../../utils/combatEvents';
import type { CharacterProfile, Combatant } from '../../types';
import { Combat5eSpells } from './Combat5eSpells';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { boardTokenImage } from './StageBattleMap';

const COMBAT_TIPS: TranslationKey[] = ['fightGuide.order', 'fightGuide.attack', 'fightGuide.hp', 'fightGuide.spells', 'fightGuide.engine'];

/** Lines of the fight log shown under the actions. */
const LOG_LINES = 8;

const isParty = (c: Combatant) => c.role === 'player' || c.role === 'companion';
const isUp = (c: Combatant) => c.hp > 0 && !c.conditions.some((condition) => condition.name === 'fled');
const tierOf = (c: Combatant) =>
  c.hp <= 0 ? 'down' : c.hp >= c.max_hp ? 'unhurt' : c.hp * 2 > c.max_hp ? 'wounded' : 'badly_wounded';

export type BoardActionMode = 'move' | 'attack' | 'spell' | 'more';

interface BoardControls {
  mode: BoardActionMode;
  onMode: (mode: BoardActionMode) => void;
  target: string | null;
  onTarget: (target: string | null) => void;
}

export const StageCombatOrder: React.FC<{
  combatants: Combatant[];
  currentIndex: number;
  portraits?: CharacterProfile[];
}> = ({ combatants, currentIndex, portraits }) => {
  const { t } = useTranslation();
  return (
    <ol aria-label={t('fight.order')} className={portraits ? 'flex gap-1.5 overflow-x-auto pb-1 text-xs' : 'flex flex-wrap gap-1.5'}>
      {combatants.map((c, index) => {
        const image = portraits && boardTokenImage(c, portraits);
        return (
          <li
            key={c.id}
            aria-current={index === currentIndex ? 'step' : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 ${
              index === currentIndex
                ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                : isParty(c)
                  ? 'border-accent-500/30 bg-accent-950/30 text-slate-200'
                  : 'border-rose-500/30 bg-rose-950/30 text-slate-200'
            } ${isUp(c) ? '' : 'opacity-40 line-through'}`}
          >
            {portraits && (image ? <img src={image} alt="" className="size-6 rounded-full object-cover" /> : (
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-slate-800 font-semibold">{c.name.charAt(0)}</span>
            ))}
            <span className="font-semibold">{c.name}</span>
            <span className="text-slate-400" title={isParty(c) ? t('fight.sheet.hp') : t('fight.tierHint')}>
              {isParty(c) ? t('fight.hp', { current: c.hp, max: c.max_hp }) : tierLabel(tierOf(c))}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * A running fight in a 5e scene: initiative order, the actions of whoever the player commands
 * and the latest events. Every number comes from the rules engine; enemies show only how hurt
 * they look.
 */
export const Combat5ePanel: React.FC<{ boardControls?: BoardControls }> = ({ boardControls }) => {
  const { t } = useTranslation();
  const { stageState, runStageCombat, isProcessingStageTurn, appLanguage, stageCombatOptions } = useStoreFields(
    'stageState', 'runStageCombat', 'isProcessingStageTurn', 'appLanguage', 'stageCombatOptions',
  );
  // The first fight explains the rules once on this device; the help button shows them again.
  const [guideSeen, setGuideSeen] = usePersistentFlag('combat5eGuideSeen', false);
  const [guideOpen, setGuideOpen] = useState(false);
  if (!stageState || stageState.definition.rules?.ruleset !== '5e' || !stageState.combat.is_active) return null;

  const combat = stageState.combat;
  const actor = combat.combatants[combat.current_turn_index];
  const waiting = combatAwaitsEngine(stageState);
  const attacks = actor?.stats5e?.attacks ?? [];
  // On a board only the engine's options count (reach, sight); without one every attack works.
  const onBoard = !!stageState.map;
  const options = stageCombatOptions;
  const enemies = combat.combatants.filter((c) => !isParty(c) && isUp(c) && (!boardControls || options?.actions.some((option) => option.target_id === c.id)));
  const selectedEnemy = enemies.find((enemy) => enemy.id === boardControls?.target);
  const shownEnemies = selectedEnemy ? [selectedEnemy] : enemies;
  const canCast = !!actor?.stats5e?.spellcasting && (options?.spells.length ?? 0) > 0;
  const showAttacks = !boardControls || boardControls.mode === 'attack';
  const showSpells = canCast && (!boardControls || boardControls.mode === 'spell');
  const showMore = !boardControls || boardControls.mode === 'more';
  const showGuide = guideOpen || (!boardControls && !guideSeen);
  const optionFor = (id: string) => (onBoard ? options?.actions.find((o) => o.id === id) : { id, disadvantage: false });
  const actionUsed = onBoard && !!options?.action_used;
  const board = (action: string, label: string, hint: string) => (
    <button
      type="button"
      disabled={isProcessingStageTurn || (action !== 'end_turn' && actionUsed)}
      onClick={() => void runStageCombat(action)}
      title={hint}
      className={`rounded-lg border px-2.5 py-1.5 font-semibold disabled:opacity-40 ${action === 'end_turn' && boardControls
        ? 'border-accent-400/60 bg-accent-600/25 text-accent-100 hover:bg-accent-600/40'
        : 'border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700'}`}
    >
      {label}
    </button>
  );
  const log = (combat.events ?? [])
    .map((event) => combatEventText(event, appLanguage))
    .filter((line): line is string => !!line)
    .slice(-LOG_LINES);
  const modes = [
    { mode: 'move', label: t('board.moveMode'), icon: Footprints, disabled: false },
    { mode: 'attack', label: t('board.attackMode'), icon: Swords, disabled: enemies.length === 0 },
    { mode: 'spell', label: t('fight.spells'), icon: Sparkles, disabled: !canCast },
    { mode: 'more', label: t('stage.more'), icon: MoreHorizontal, disabled: false },
  ] as const;
  const logBody = (
    <div aria-label={t('fight.log')} aria-live="polite" className={`${boardControls ? 'max-h-28' : 'max-h-40'} overflow-y-auto rounded-lg bg-app/60 p-2 font-mono text-[11px] leading-relaxed text-slate-300`}>
      {log.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
    </div>
  );

  return (
    <section
      aria-label={t('fight.title')}
      data-testid="combat-5e"
      data-busy={isProcessingStageTurn}
      className={`space-y-2 rounded-xl border bg-slate-900/90 p-3 text-xs ${
        boardControls
          ? 'border-slate-700'
          : 'mx-4 my-2 min-h-0 max-h-[min(22rem,38vh)] shrink-0 overflow-y-auto border-rose-500/30 shadow-xl'
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-100">
        <Swords className="w-4 h-4 text-rose-400" />
        {boardControls && actor && !waiting ? t('fight.yourTurn', { name: actor.name }) : t('fight.title')}
        <span className="rounded-full border border-rose-500/50 bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
          {t('stage.round', { round: combat.round })}
        </span>
        {combat.difficulty && (
          <span data-testid="fight-difficulty" title={t('fight.difficultyHint')} className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-300">
            {t(`fight.difficulty.${combat.difficulty}` as TranslationKey)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          aria-label={t('fightGuide.open')}
          title={t('fightGuide.open')}
          data-fight-help
          aria-expanded={showGuide}
          className="ml-auto flex items-center gap-1.5 rounded-lg p-1 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-rose-200"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
          {boardControls && !guideSeen && t('fightGuide.open')}
        </button>
      </header>

      {showGuide && (
        <section aria-labelledby="fight-guide-title" data-fight-guide className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 space-y-2">
          <h3 id="fight-guide-title" className="text-xs font-semibold text-rose-100">{t('fightGuide.title')}</h3>
          <ul className="list-disc space-y-1 pl-4 text-slate-300">
            {COMBAT_TIPS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              data-fight-help
              onClick={() => {
                setGuideSeen(true);
                setGuideOpen(false);
              }}
              className="rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
            >
              {t('stageGuide.understood')}
            </button>
          </div>
        </section>
      )}

      {!boardControls && <StageCombatOrder combatants={combat.combatants} currentIndex={combat.current_turn_index} />}

      {actor && !waiting ? (
        <div className="space-y-2">
          {!boardControls && <p className="font-semibold text-amber-200">{t('fight.yourTurn', { name: actor.name })}</p>}
          {onBoard && options && (
            <p className="text-slate-400" data-testid="turn-budget">
              {t('board.budget', { feet: options.movement_left_ft })}
              {actionUsed && <> · {t('board.actionUsed')}</>}
              {options.bonus_action_used && <> · {t('fight.bonusUsed')}</>}
            </p>
          )}
          {boardControls && (
            <div className="flex flex-wrap items-center gap-1.5">
              {modes.map(({ mode, label, icon: Icon, disabled }) => (
                <button
                  key={mode}
                  type="button"
                  data-board-mode={mode}
                  aria-pressed={boardControls.mode === mode}
                  disabled={isProcessingStageTurn || disabled}
                  onClick={() => boardControls.onMode(mode)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-slate-200 hover:bg-slate-800 aria-pressed:border-accent-400/50 aria-pressed:bg-accent-600/25 disabled:opacity-40"
                >
                  <Icon aria-hidden="true" size={15} />{label}
                </button>
              ))}
              <div className="ml-auto">{board('end_turn', t('board.endTurn'), t('board.endTurnHint'))}</div>
            </div>
          )}
          {boardControls?.mode === 'move' && <p className="text-slate-400">{t('board.moveHint')}</p>}
          {boardControls?.mode === 'attack' && !selectedEnemy && (
            <p className="text-slate-400">{enemies.length ? t('board.targetHint') : t(actionUsed ? 'board.actionUsed' : 'board.outOfReach')}</p>
          )}
          {boardControls?.mode === 'attack' && selectedEnemy && (
            <button type="button" onClick={() => boardControls.onTarget(null)} className="text-accent-200 underline">
              {t('board.allTargets')}
            </button>
          )}
          <div className={boardControls ? 'max-h-[26vh] space-y-2 overflow-y-auto' : 'space-y-2'}>
            {showAttacks && shownEnemies.map((enemy) => (
              <div key={enemy.id} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-28 text-slate-300">
                  {enemy.name} <span className="text-slate-500">({tierLabel(tierOf(enemy))})</span>
                </span>
                {attacks.map((attack) => {
                  const option = optionFor(`attack:${attack.id}:${enemy.id}`);
                  if (boardControls && !option) return null;
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
            {showSpells && (
              <Combat5eSpells actor={actor} spells={options!.spells} combatants={combat.combatants} disabled={isProcessingStageTurn} />
            )}
            {showMore && (options?.features.length ?? 0) > 0 && (
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
            {showMore && <div className="flex flex-wrap gap-1.5">
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
                  {!boardControls && board('end_turn', t('board.endTurn'), t('board.endTurnHint'))}
                </>
              )}
            </div>}
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

      {log.length > 0 && (boardControls ? (
        <details className="text-slate-400">
          <summary className="cursor-pointer py-1">{t('fight.log')}</summary>
          {logBody}
        </details>
      ) : logBody)}
    </section>
  );
};
