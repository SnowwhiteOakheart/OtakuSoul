import React from 'react';
import { CheckCircle2, Circle, Compass, Hammer, KeyRound, Loader2, Trophy } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { localizedName } from '../../utils/combatEvents';
import { exploreEventText } from '../../utils/exploreEvents';

/** Lines of the exploration log shown. */
const LOG_LINES = 8;

/**
 * Exploring a 5e map between fights: where the party is, what is known to be locked (pick or
 * force it) and the latest events. Walking and opening happen on the board.
 */
export const Explore5ePanel: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, runStageExploration, continueAdventure, isProcessingStageTurn, appLanguage } = useStoreFields(
    'stageState', 'runStageExploration', 'continueAdventure', 'isProcessingStageTurn', 'appLanguage',
  );
  const map = stageState?.map;
  if (!stageState || !map || stageState.combat.is_active) return null;
  const explored = map.revealed.length > 0;
  const leader = stageState.combat.combatants.find((c) => c.role === 'player' && c.position) ?? stageState.combat.combatants.find((c) => c.position);
  const room = leader?.position
    ? map.rooms.find(({ area: [x0, y0, x1, y1] }) => leader.position!.x >= x0 && leader.position!.x <= x1 && leader.position!.y >= y0 && leader.position!.y <= y1)
    : undefined;
  const locks = map.locks.filter((lock) => lock.known);
  const log = (stageState.exploration ?? []).slice(-LOG_LINES).map((event) => exploreEventText(event, appLanguage));
  const button = 'flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold disabled:opacity-40';
  // Adventure acts: goals the engine checks off; all reached = the act is done.
  const goals = stageState.definition.rules?.goals ?? [];
  const reached = (id: string) => stageState.objectives.some((o) => o.id === id && o.status === 'completed');
  const actDone = goals.length > 0 && goals.every((goal) => reached(goal.id));
  const nextScene = stageState.definition.rules?.next_scene;

  return (
    <section
      aria-label={t('explore.title')}
      data-testid="explore-5e"
      data-busy={isProcessingStageTurn}
      className="mx-4 my-2 rounded-2xl border border-sky-500/30 bg-slate-900/90 p-3 space-y-3 text-xs shadow-xl"
    >
      <header className="flex items-center gap-2 text-sm font-bold text-slate-100">
        <Compass className="w-4 h-4 text-sky-400" />
        {t('explore.title')}
        {isProcessingStageTurn && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </header>
      <p className="font-semibold text-sky-200" data-testid="explore-room">
        {room ? t('explore.room', { room: localizedName(room.name, appLanguage) }) : t('explore.between')}
      </p>
      {explored ? (
        <p className="text-slate-400">{t('explore.hint')}</p>
      ) : (
        <button
          type="button"
          disabled={isProcessingStageTurn}
          onClick={() => void runStageExploration()}
          className={`${button} border-sky-500/40 bg-sky-950/50 text-sky-100 hover:bg-sky-900`}
        >
          <Compass className="w-3.5 h-3.5" /> {t('explore.start')}
        </button>
      )}
      {goals.length > 0 && (
        <div className="space-y-1" data-testid="explore-goals">
          <p className="font-semibold text-slate-200">{t('explore.goals')}</p>
          <ul className="space-y-0.5">
            {goals.map((goal) => (
              <li key={goal.id} data-goal={goal.id} data-reached={reached(goal.id)} className={`flex items-center gap-1.5 ${reached(goal.id) ? 'text-emerald-300' : 'text-slate-300'}`}>
                {reached(goal.id) ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 text-slate-500" />}
                {localizedName(goal.title, appLanguage)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {actDone && (
        <div className="space-y-2 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3" data-testid="act-done">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100">
            <Trophy className="w-4 h-4" /> {nextScene ? t('explore.actDone') : t('explore.adventureDone')}
          </p>
          {nextScene && (
            <>
              <p className="text-amber-100/80">{t('explore.actDoneHint')}</p>
              <button
                type="button"
                disabled={isProcessingStageTurn}
                onClick={() => void continueAdventure()}
                className={`${button} border-amber-400/60 bg-amber-600/30 text-amber-50 hover:bg-amber-600/50`}
              >
                {t('explore.nextAct')}
              </button>
            </>
          )}
        </div>
      )}
      {locks.length > 0 && (
        <div className="space-y-1.5" data-testid="explore-locks">
          <p className="font-semibold text-amber-200">{t('explore.locks')}</p>
          {locks.map((lock) => (
            <div key={`${lock.at.x}:${lock.at.y}`} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-28 text-slate-300">{t('explore.lockAt', { x: lock.at.x + 1, y: lock.at.y + 1 })}</span>
              <button
                type="button"
                disabled={isProcessingStageTurn}
                data-lock-action={`pick:${lock.at.x}:${lock.at.y}`}
                onClick={() => void runStageExploration(`pick:${lock.at.x}:${lock.at.y}`)}
                title={t('explore.pickHint')}
                className={`${button} border-amber-500/40 bg-amber-950/40 text-amber-100 hover:bg-amber-900/60`}
              >
                <KeyRound className="w-3.5 h-3.5" /> {t('explore.pick')}
              </button>
              <button
                type="button"
                disabled={isProcessingStageTurn}
                data-lock-action={`force:${lock.at.x}:${lock.at.y}`}
                onClick={() => void runStageExploration(`force:${lock.at.x}:${lock.at.y}`)}
                title={t('explore.forceHint')}
                className={`${button} border-rose-500/40 bg-rose-950/40 text-rose-100 hover:bg-rose-900/60`}
              >
                <Hammer className="w-3.5 h-3.5" /> {t('explore.force')}
              </button>
            </div>
          ))}
        </div>
      )}
      {log.length > 0 && (
        <div aria-label={t('explore.log')} aria-live="polite" className="max-h-40 overflow-y-auto rounded-lg bg-app/60 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
          {log.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
      )}
    </section>
  );
};
