import React from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { localizedName } from '../../utils/combatEvents';
import { StageBattleMap } from './StageBattleMap';
import { Combat5ePanel } from './Combat5ePanel';
import { PartyHeader } from './PartyHeader';

/**
 * The board tab of a 5e scene: the battle map with the fight panel beside it. Outside a fight
 * the map shows where the party stood last.
 */
export const StageBoardView: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, stageCombatOptions, runStageCombat, isProcessingStageTurn, appLanguage } = useStoreFields(
    'stageState', 'stageCombatOptions', 'runStageCombat', 'isProcessingStageTurn', 'appLanguage',
  );
  const map = stageState?.map;
  if (!stageState || !map) return null;
  const combat = stageState.combat;
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
            disabled={isProcessingStageTurn || !combat.is_active}
            onAction={(action) => void runStageCombat(action)}
          />
          {!combat.is_active && <p className="mt-2 text-xs text-slate-400">{t('board.noFight')}</p>}
        </div>
        <div className="lg:w-[420px] shrink-0 overflow-y-auto">
          <Combat5ePanel />
        </div>
      </div>
    </div>
  );
};
