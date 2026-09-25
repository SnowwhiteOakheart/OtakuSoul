import { Bot } from 'lucide-react';

export const CompanionView = () => {
  return (
    <div className="flex-1 p-6 flex flex-col items-center justify-center bg-slate-950 text-center">
      <div className="max-w-md p-8 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 backdrop-blur space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
          <Bot className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Soul Companion: Autonomer Desktop-Agent</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Autonomer Assistent mit neurohormoneller Simulation (Dopamin, Cortisol, Oxytocin), MCP-Client (Model Context Protocol) und sicherheitsüberwachtem Tool-Calling mit 25s Countdown.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2 text-xs font-mono text-cyan-300">
          <span className="px-2.5 py-1 rounded-md bg-cyan-900/40 border border-cyan-700/40">
            Vorbereitet für Phase 7
          </span>
        </div>
      </div>
    </div>
  );
};
