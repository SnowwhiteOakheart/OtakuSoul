import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Heart, Zap, Flame, Shield, User, Coffee } from 'lucide-react';

export const PartyHeader: React.FC = () => {
  const { stageState, restStageParty, isProcessingStageTurn } = useAppStore();

  if (!stageState) return null;

  const combatants = stageState.combat?.combatants || [];
  const partyCombatants = combatants.filter(
    (c) => c.role === 'player' || c.role === 'companion'
  );

  // If no combatants are defined yet, create fallback display from definition.party
  const displayParty =
    partyCombatants.length > 0
      ? partyCombatants
      : [
          {
            id: 'player',
            name: stageState.definition.persona || 'Spieler',
            role: 'player' as const,
            hp: 50,
            max_hp: 50,
            stress: 0,
            max_stress: 100,
            initiative: 10,
            conditions: [],
          },
          ...stageState.definition.party.map((p, i) => ({
            id: `comp_${i}`,
            name: p,
            role: 'companion' as const,
            hp: 40,
            max_hp: 40,
            stress: 10,
            max_stress: 100,
            initiative: 12,
            conditions: [],
          })),
        ];

  return (
    <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2.5 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Party members avatars and stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Shield className="w-3.5 h-3.5 text-accent-400" />
            Gruppe:
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
                    <span className="text-[10px] text-slate-400 font-mono">
                      {member.hp}/{member.max_hp}
                    </span>
                  </div>

                  {/* HP Bar */}
                  <div className="flex items-center gap-1.5">
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
                  <div className="flex items-center gap-1.5">
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
                        className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/30 text-[9px] text-amber-300 font-medium"
                        title={`${cond.name} (${cond.rounds_remaining} Runden)`}
                      >
                        {cond.name}
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
          <button
            onClick={() => restStageParty('short')}
            disabled={isProcessingStageTurn}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition disabled:opacity-50"
            title="Kurze Rast: +15 LP, -10 Stress"
          >
            <Coffee className="w-3.5 h-3.5 text-amber-400" />
            <span>Kurze Rast</span>
          </button>

          <button
            onClick={() => restStageParty('long')}
            disabled={isProcessingStageTurn}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 text-xs font-medium border border-amber-600/40 transition disabled:opacity-50"
            title="Lange Rast (Lagerfeuer): +40 LP, -30 Stress, Tageszeit schreitet fort"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Lange Rast</span>
          </button>
        </div>
      </div>
    </div>
  );
};
