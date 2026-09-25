import { Dice5 } from 'lucide-react';

export const StageView: React.FC = () => {
  return (
    <div className="flex-1 p-6 flex flex-col items-center justify-center bg-slate-950 text-center">
      <div className="max-w-md p-8 rounded-2xl border border-purple-500/30 bg-purple-950/20 backdrop-blur space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/20">
          <Dice5 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Soul Stage: Tabletop RPG Core</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Strukturierte Pen-&-Paper Kampagnen mit KI-Spielleiter, deterministischer Würfel-Engine (d20, d100, 2d6), HP/Stress-HUD, Kampagnen-Clocks und taktischem Kampfmodus.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2 text-xs font-mono text-purple-300">
          <span className="px-2.5 py-1 rounded-md bg-purple-900/40 border border-purple-700/40">
            Vorbereitet für Phase 6
          </span>
        </div>
      </div>
    </div>
  );
};
