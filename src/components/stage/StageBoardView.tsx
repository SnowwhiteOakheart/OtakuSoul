import React, { useEffect } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { localizedName } from '../../utils/combatEvents';
import { StageBattleMap } from './StageBattleMap';
import { Combat5ePanel } from './Combat5ePanel';
import { Explore5ePanel } from './Explore5ePanel';
import { PartyHeader } from './PartyHeader';

/**
 * The board tab of a 5e scene: the battle map with the fight panel beside it. Outside a fight
 * the map shows where the party stood last.
 */
export const StageBoardView: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, stageCombatOptions, runStageCombat, runStageExploration, isProcessingStageTurn, appLanguage } = useStoreFields(
    'stageState', 'stageCombatOptions', 'runStageCombat', 'runStageExploration', 'isProcessingStageTurn', 'appLanguage',
  );
  const map = stageState?.map;
  // A scene with a map is explored with fog of war; opening the board starts it.
  const needsStart = !!stageState && !stageState.combat.is_active && !!stageState.definition.rules?.map_id && (!map || map.revealed.length === 0);
  const sceneId = stageState?.definition.id;
  useEffect(() => {
    if (needsStart) void runStageExploration();
  }, [needsStart, sceneId, runStageExploration]);
  if (!stageState || !map) return null;
  const combat = stageState.combat;
  const exploring = !combat.is_active && map.revealed.length > 0;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PartyHeader />
      <div className="flex-1 flex flex-col lg:flex-row gap-3 overflow-hidden p-3">
        <div className="flex-1 min-h-0 overflow-auto">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{localizedName(map.name, appLanguage)}</h3>
          <StageBattleMap
            map={map}
            combatants={combat.combatants}
            currentIndex={combat.current_turn_index}
            options={combat.is_active ? stageCombatOptions : null}
            disabled={isProcessingStageTurn || (!combat.is_active && !exploring)}
            onAction={(action) => void (combat.is_active ? runStageCombat(action) : runStageExploration(action))}
            exploring={exploring}
          />
          {!combat.is_active && !exploring && <p className="mt-2 text-xs text-slate-400">{t('board.noFight')}</p>}
        </div>
        <div className="lg:w-[420px] shrink-0 overflow-y-auto">
          <Combat5ePanel />
          <Explore5ePanel />
        </div>
      </div>
    </div>
  );
};
