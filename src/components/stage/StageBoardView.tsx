import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { StageBattleMap } from './StageBattleMap';
import { Combat5ePanel, StageCombatOrder, type BoardActionMode } from './Combat5ePanel';
import { Explore5ePanel } from './Explore5ePanel';
import { Map } from 'lucide-react';

/**
 * The same playable board sits beside the story and fills the workspace in its focus view.
 */
export const StageBoardView: React.FC<{ focused: boolean; onToggleFocus: () => void }> = ({ focused, onToggleFocus }) => {
  const { t } = useTranslation();
  const { stageState, stageCombatOptions, runStageCombat, runStageExploration, isProcessingStageTurn, availableCharacters, setStageAimedSpell } = useStoreFields(
    'stageState', 'stageCombatOptions', 'runStageCombat', 'runStageExploration', 'isProcessingStageTurn', 'availableCharacters', 'setStageAimedSpell',
  );
  const [selection, setSelection] = useState<{ turn: string; mode: BoardActionMode; target: string | null }>();
  const map = stageState?.map;
  // Explicitly opening the board starts exploration. Showing the adjacent pane leaves the current story turn alone.
  const needsStart = !!stageState && !stageState.combat.is_active && !!stageState.definition.rules?.map_id && (!map || map.revealed.length === 0);
  const sceneId = stageState?.definition.id;
  useEffect(() => {
    if (focused && needsStart) void runStageExploration();
  }, [focused, needsStart, sceneId, runStageExploration]);
  if (!stageState) return null;
  const pane = `flex min-w-0 flex-1 flex-col ${focused
    ? 'min-h-0 overflow-y-auto'
    : 'shrink-0 @min-[800px]:min-h-0 @min-[800px]:overflow-y-auto'}`;
  if (!map) {
    return (
      <div className={`${pane} min-h-56 items-center justify-center gap-3 p-4 text-slate-300`}>
        <Map aria-hidden="true" className="size-6 text-accent-300" />
        <h3 className="text-sm font-semibold text-slate-100">{t('board.tab')}</h3>
        {needsStart && (
          <button
            type="button"
            disabled={isProcessingStageTurn}
            onClick={() => void runStageExploration()}
            className="rounded-lg border border-accent-400/40 bg-accent-600/20 px-3 py-1.5 text-xs font-semibold hover:bg-accent-600/35 disabled:opacity-40"
          >
            {t('explore.start')}
          </button>
        )}
        <Combat5ePanel />
      </div>
    );
  }
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
    <div className={pane}>
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
          focused={focused}
          onToggleFocus={onToggleFocus}
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
