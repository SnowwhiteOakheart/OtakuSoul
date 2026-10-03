import React, { useState } from 'react';
import { StageNpcPanel } from './StageNpcPanel';
import { useStoreFields } from '../../store/useAppStore';
import { Heart, Zap, Flame, Shield, User, Coffee, Settings } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { ModalOverlay } from '../ui/ModalOverlay';
import { invoke } from '@tauri-apps/api/core';

export const PartyHeader: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, restStageParty, isProcessingStageTurn } = useStoreFields(
    'stageState', 'restStageParty', 'isProcessingStageTurn'
  );
  const [editingSkillsFor, setEditingSkillsFor] = useState<string | null>(null);

  if (!stageState) return null;

  const combatants = stageState.combat?.combatants || [];
  const partyCombatants = combatants.filter(
    (c) => c.role === 'player' || c.role === 'companion'
  );

  // The backend keeps player and companions in this list at all times (also outside combat).
  const displayParty = partyCombatants;

  return (
    <>
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Party members avatars and stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Shield className="w-3.5 h-3.5 text-accent-400" />
            {t('stage.party')}
          </div>

          {displayParty.map((member) => {
            const hpPercent = Math.max(0, Math.min(100, Math.round((member.hp / member.max_hp) * 100)));
            const stressPercent = Math.max(0, Math.min(100, Math.round((member.stress / member.max_stress) * 100)));

            const isPlayer = member.role === 'player';

            return (
              <div
                key={member.id}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-app/60 border border-slate-800 shadow-sm"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                    isPlayer
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                      : 'bg-accent-600/30 text-accent-300 border border-accent-500/40'
                  }`}
                >
                  {isPlayer ? <User className="w-3.5 h-3.5" /> : member.name.charAt(0)}
                </div>

                <div className="flex flex-col gap-1 min-w-[120px]">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-200 truncate max-w-[90px]">{member.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingSkillsFor(member.id)}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="Fertigkeiten"
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {member.hp}/{member.max_hp}
                      </span>
                    </div>
                  </div>

                  {/* HP Bar */}
                  <div
                    className="flex items-center gap-1.5"
                    role="meter"
                    aria-label={t('stage.hp', { current: member.hp, max: member.max_hp })}
                    aria-valuenow={member.hp}
                    aria-valuemin={0}
                    aria-valuemax={member.max_hp}
                  >
                    <Heart className="w-2.5 h-2.5 text-rose-400" />
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          hpPercent > 50
                            ? 'bg-emerald-500'
                            : hpPercent > 25
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Stress Bar */}
                  <div
                    className="flex items-center gap-1.5"
                    role="meter"
                    aria-label={t('stage.stress', { current: member.stress, max: member.max_stress })}
                    aria-valuenow={member.stress}
                    aria-valuemin={0}
                    aria-valuemax={member.max_stress}
                  >
                    <Zap className="w-2.5 h-2.5 text-accent-400" />
                    <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-accent-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${stressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Conditions badges */}
                {member.conditions && member.conditions.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {member.conditions.map((cond, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/30 text-[11px] text-amber-300 font-medium"
                        title={t('stage.conditionRounds', { name: cond.name, rounds: cond.rounds_remaining })}
                      >
                        {cond.name} · {cond.rounds_remaining}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rest triggers */}
        <div className="flex items-center gap-2">
          <StageNpcPanel />
          <button
            onClick={() => restStageParty('short')}
            disabled={isProcessingStageTurn}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition disabled:opacity-50"
            title={t('stage.shortRestHint')}
          >
            <Coffee className="w-3.5 h-3.5 text-amber-400" />
            <span className="whitespace-nowrap">{t('stage.shortRest')}</span>
          </button>

          <button
            onClick={() => restStageParty('long')}
            disabled={isProcessingStageTurn}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 text-xs font-medium border border-amber-600/40 transition disabled:opacity-50"
            title={t('stage.longRestHint')}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="whitespace-nowrap">{t('stage.longRest')}</span>
          </button>
        </div>
      </div>
    </div>
      {editingSkillsFor && (
        <SkillsModal
          combatantId={editingSkillsFor}
          onClose={() => setEditingSkillsFor(null)}
        />
      )}
    </>
  );
};

const SkillsModal: React.FC<{
  combatantId: string;
  onClose: () => void;
}> = ({ combatantId, onClose }) => {
  const { stageState } = useStoreFields('stageState');
  
  const combatant = stageState?.combat?.combatants.find((c) => c.id === combatantId);
  const initialText = combatant 
    ? Object.entries(combatant.skills || {}).map(([k, v]) => `${k}: ${v}`).join('\n') 
    : '';
    
  const [text, setText] = useState(initialText);

  if (!combatant || !stageState) return null;

  const handleSave = async () => {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0]!.trim();
        const value = parseInt(parts[1]!.trim(), 10) || 0;
        await invoke('stage_set_combatant_skill', { combatantId: combatant.id, skillName: key, value });
      }
    }
    
    // Refresh stage scene to pick up new skills
    await invoke('load_stage_scene', { sceneId: stageState.definition.id });
    onClose();
  };

  return (
    <ModalOverlay title={`Fertigkeiten - ${combatant.name}`} onClose={onClose}>
      <div className="p-4 flex flex-col gap-3 w-[400px]">
        <p className="text-sm text-slate-400">
          Trage hier Fertigkeiten und Modifikatoren ein (z.B. "Wahrnehmung: 3"). Eine pro Zeile.
        </p>
        <textarea
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 font-mono h-40 focus:outline-none focus:border-accent-500 transition-colors resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Stärke: 2&#10;Geschick: 1&#10;Charisma: -1"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition font-medium text-sm"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-500 transition font-medium text-sm"
          >
            Speichern
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
