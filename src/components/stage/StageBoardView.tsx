import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { StageBattleMap } from './StageBattleMap';
import { Combat5ePanel, StageCombatOrder, type BoardActionMode } from './Combat5ePanel';
import { Explore5ePanel } from './Explore5ePanel';
import { PartyHeader } from './PartyHeader';

/**
 * The board tab of a 5e scene: the battle map with the fight panel beside it. Outside a fight
 * the map shows where the party stood last.
 */
export const StageBoardView: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, stageCombatOptions, runStageCombat, runStageExploration, isProcessingStageTurn, availableCharacters, setStageAimedSpell } = useStoreFields(
    'stageState', 'stageCombatOptions', 'runStageCombat', 'runStageExploration', 'isProcessingStageTurn', 'availableCharacters', 'setStageAimedSpell',
  );
  const [selection, setSelection] = useState<{ turn: string; mode: BoardActionMode; target: string | null }>();
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
  const boardKey = `${sceneId}:${map.id}`;
  const turn = `${boardKey}:${combat.is_active}:${combat.round}:${combat.current_turn_index}`;
  const mode = selection?.turn === turn ? selection.mode : 'move';
  const target = selection?.turn === turn ? selection.target : null;
  const selectTarget = (next: string | null) => setSelection({ turn, mode, target: next });
  const selectMode = (next: BoardActionMode) => {
    if (next !== 'spell') setStageAimedSpell(null);
    setSelection({ turn, mode: next, target: next === 'attack' ? target : null });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PartyHeader />
      <div className="flex min-h-fit flex-1 flex-col gap-2 p-3">
        {combat.is_active && <StageCombatOrder combatants={combat.combatants} currentIndex={combat.current_turn_index} portraits={availableCharacters} />}
        <StageBattleMap
          key={boardKey}
          map={map}
          combatants={combat.combatants}
          currentIndex={combat.current_turn_index}
          options={combat.is_active ? stageCombatOptions : null}
          disabled={isProcessingStageTurn || (!combat.is_active && !exploring)}
          onAction={(action) => void (combat.is_active ? runStageCombat(action) : runStageExploration(action))}
          exploring={exploring}
          selectedTarget={mode === 'attack' ? target : null}
          onTarget={mode === 'attack' ? selectTarget : undefined}
        />
        {!combat.is_active && !exploring && <p className="text-xs text-slate-400">{t('board.noFight')}</p>}
        <Combat5ePanel boardControls={{ mode, onMode: selectMode, target, onTarget: selectTarget }} />
        <Explore5ePanel />
      </div>
    </div>
  );
};
