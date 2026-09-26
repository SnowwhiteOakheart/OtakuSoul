import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Backpack,
  CheckCircle2,
  CircleDashed,
  HeartHandshake,
  KeyRound,
  PackageOpen,
  ScrollText,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

const progressWidth = (current: number, max: number) =>
  `${Math.min(100, Math.round((current / Math.max(1, max)) * 100))}%`;

export const StageCampaignPanel: React.FC = () => {
  const { stageState, useStageInventoryItem } = useAppStore();

  if (!stageState) return null;

  const { inventory, objectives, arcs, relationships, consequence_ledger: consequences } = stageState;
  const facts = Object.entries(stageState.world.key_facts || {});

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Backpack className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">Inventar</h3>
            <p className="text-[11px] text-slate-400">Verbrauchsgegenstände wirken sofort und werden gespeichert.</p>
          </div>
        </div>

        {inventory.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {inventory.map((item) => (
              <div key={item.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-3">
                <div className="p-2 h-fit rounded-lg bg-amber-500/10 text-amber-300">
                  {item.item_type === 'key' ? <KeyRound className="w-4 h-4" /> : <PackageOpen className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200 truncate">{item.name}</span>
                    <span className="text-[10px] font-mono text-amber-300">×{item.quantity}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>
                  {item.item_type === 'consumable' && (
                    <button
                      onClick={() => useStageInventoryItem(item.id)}
                      className="mt-2 px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition"
                    >
                      Benutzen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-xs text-slate-500">Das Inventar ist leer.</p>
        )}
      </section>

      <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">Ziele & Story-Arcs</h3>
            <p className="text-[11px] text-slate-400">Der Spielleiter aktualisiert Fortschritt und Enthüllungen.</p>
          </div>
        </div>

        <div className="space-y-2">
          {objectives.map((objective) => (
            <div key={objective.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  {objective.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <CircleDashed className="w-3.5 h-3.5 text-cyan-400" />}
                  {objective.title}
                </span>
                <span className="font-mono text-slate-400">{objective.current}/{objective.max}</span>
              </div>
              {objective.description && <p className="text-[11px] text-slate-500 mt-1">{objective.description}</p>}
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500" style={{ width: progressWidth(objective.current, objective.max) }} />
              </div>
            </div>
          ))}

          {arcs.filter((arc) => arc.is_revealed).map((arc) => (
            <div key={arc.id} className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20">
              <div className="flex justify-between gap-2 text-xs">
                <span className="font-semibold text-purple-200 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />{arc.title}</span>
                <span className="font-mono text-purple-300">{arc.stage}/{arc.max_stage}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{arc.description}</p>
            </div>
          ))}

          {!objectives.length && !arcs.some((arc) => arc.is_revealed) && (
            <p className="text-xs text-slate-500">Noch keine sichtbaren Kampagnenziele.</p>
          )}
        </div>
      </section>

      <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5 text-pink-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">Beziehungen</h3>
            <p className="text-[11px] text-slate-400">Rasten vertieft Bindungen und löst Meilensteine aus.</p>
          </div>
        </div>
        {relationships.length ? relationships.map((relationship) => (
          <div key={`${relationship.subject}-${relationship.target}`} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex justify-between text-xs gap-2">
              <span className="font-semibold text-slate-200">{relationship.subject} → {relationship.target}</span>
              <span className="font-mono text-pink-300">{relationship.affinity}/100</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-600 to-fuchsia-400" style={{ width: `${Math.max(0, relationship.affinity)}%` }} />
            </div>
            {(relationship.role_view || relationship.last_shift_reason) && (
              <p className="text-[11px] text-slate-500 mt-1.5">{relationship.role_view}{relationship.last_shift_reason ? ` · ${relationship.last_shift_reason}` : ''}</p>
            )}
          </div>
        )) : <p className="text-xs text-slate-500">Noch keine Beziehungen erfasst.</p>}
      </section>

      <section className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <TriangleAlert className="w-5 h-5 text-rose-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">Chronik & Fakten</h3>
            <p className="text-[11px] text-slate-400">Dauerhafte Folgen und kanonische Weltinformationen.</p>
          </div>
        </div>
        <div className="space-y-2">
          {consequences.slice().reverse().map((entry) => (
            <div key={entry.id} className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs text-slate-300">{entry.text}</div>
          ))}
          {facts.map(([key, value]) => (
            <div key={key} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
              <span className="text-purple-300 font-semibold">{key.replace(/_/g, ' ')}:</span>{' '}
              <span className="text-slate-400">{value}</span>
            </div>
          ))}
          {!consequences.length && !facts.length && <p className="text-xs text-slate-500">Die Chronik enthält noch keine Einträge.</p>}
        </div>
      </section>
    </div>
  );
};
