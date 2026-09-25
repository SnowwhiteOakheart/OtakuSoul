import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { SafetyCountdownBanner } from './SafetyCountdownBanner';
import {
  Bot,
  Activity,
  Heart,
  Zap,
  Flame,
  Moon,
  Smile,
  Shield,
  Clock,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const CompanionView: React.FC = () => {
  const {
    companionState,
    fetchCompanionState,
    applyHormoneInteraction,
    requestToolCall,
    updateCompanionSettings,
  } = useAppStore();

  const [testTool, setTestTool] = useState('open_external_url');
  const [testArg, setTestArg] = useState('https://github.com/SnowwhiteOakheart/OtakuSoul');

  useEffect(() => {
    fetchCompanionState();
  }, [fetchCompanionState]);

  const hormones = companionState?.hormones;
  const settings = companionState?.settings;
  const history = companionState?.tool_history || [];

  const handleRunTool = async (e: React.FormEvent) => {
    e.preventDefault();
    let args: Record<string, any> = {};
    if (testTool === 'open_external_url') {
      args = { url: testArg };
    } else if (testTool === 'set_timer') {
      args = { seconds: parseInt(testArg) || 60, label: 'OtakuSoul Timer' };
    } else if (testTool === 'web_search') {
      args = { query: testArg };
    }
    await requestToolCall(testTool, args);
  };

  const handleToggleAutoApprove = () => {
    if (!settings) return;
    updateCompanionSettings({
      ...settings,
      auto_approve_safe_tools: !settings.auto_approve_safe_tools,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-y-auto p-4 lg:p-6 space-y-6 relative">
      {/* Global Safety Countdown Banner */}
      <SafetyCountdownBanner />

      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-cyan-950/20 to-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Soul Companion: Desktop-Agent & Neurohormonale Simulation
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 font-mono">
                MCP & Tools
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Biometrisches Hormonsystem (Dopamin, Cortisol, Oxytocin) & 25s Human-in-the-Loop Sicherheit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Gemüt: <strong>{hormones?.mood_label || 'Aktiv'}</strong></span>
          </span>
        </div>
      </div>

      {/* Grid: Hormones & Tool Bench */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Neurohormonal System */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-pink-400" />
                Neurohormoneller Bio-Monitor
              </h3>
              <p className="text-[11px] text-slate-400">
                Reaktive physiologische Spiegel basierend auf Dialogen und Aktionen
              </p>
            </div>
            <span className="text-xs font-mono text-slate-300 px-2 py-0.5 rounded bg-slate-800">
              Energie: {hormones?.energy_level}%
            </span>
          </div>

          {/* 4 Hormone Gauges */}
          {hormones && (
            <div className="grid grid-cols-2 gap-3">
              {/* Dopamine */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Dopamin
                  </span>
                  <span className="font-mono text-amber-300">{Math.round(hormones.dopamine)}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${hormones.dopamine}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">Antrieb & Neugier</span>
              </div>

              {/* Cortisol */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    Cortisol
                  </span>
                  <span className="font-mono text-rose-300">{Math.round(hormones.cortisol)}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-gradient-to-r from-rose-500 to-red-600 rounded-full transition-all duration-500"
                    style={{ width: `${hormones.cortisol}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">Stress & Abwehr</span>
              </div>

              {/* Oxytocin */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                    Oxytocin
                  </span>
                  <span className="font-mono text-pink-300">{Math.round(hormones.oxytocin)}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-gradient-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-500"
                    style={{ width: `${hormones.oxytocin}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">Bindung & Zärtlichkeit</span>
              </div>

              {/* Fatigue */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    Erschöpfung
                  </span>
                  <span className="font-mono text-indigo-300">{Math.round(hormones.fatigue)}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${hormones.fatigue}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">Schlafdruck</span>
              </div>
            </div>
          )}

          {/* Quick Simulation Actions */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Biometrische Impulse
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => applyHormoneInteraction('compliment')}
                className="px-3 py-1.5 rounded-lg bg-pink-900/40 hover:bg-pink-800/50 text-pink-300 border border-pink-500/30 flex items-center gap-1.5 transition active:scale-95"
              >
                <Smile className="w-3.5 h-3.5" />
                Kompliment machen (+Oxytocin)
              </button>
              <button
                onClick={() => applyHormoneInteraction('challenge')}
                className="px-3 py-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition active:scale-95"
              >
                <Zap className="w-3.5 h-3.5" />
                Herausforderung (+Dopamin)
              </button>
              <button
                onClick={() => applyHormoneInteraction('rest')}
                className="px-3 py-1.5 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition active:scale-95"
              >
                <Moon className="w-3.5 h-3.5" />
                Ausruhen & Schlafen
              </button>
            </div>
          </div>
        </div>

        {/* Right: Tool Calling & Human-in-the-Loop Station */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Tool Execution & MCP Client
              </h3>
              <p className="text-[11px] text-slate-400">
                Sicherheitsüberwachte Desktop-Aktionen mit 25s Bestätigungs-Countdown
              </p>
            </div>
          </div>

          {/* Test Form */}
          <form onSubmit={handleRunTool} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Aktion / Tool auswählen
              </label>
              <select
                value={testTool}
                onChange={(e) => {
                  const val = e.target.value;
                  setTestTool(val);
                  if (val === 'open_external_url') {
                    setTestArg('https://github.com/SnowwhiteOakheart/OtakuSoul');
                  } else if (val === 'set_timer') {
                    setTestArg('120');
                  } else if (val === 'web_search') {
                    setTestArg('Three.js VRM LipSync');
                  } else {
                    setTestArg('');
                  }
                }}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="open_external_url">URL öffnen (Erfordert Bestätigung ⚠️)</option>
                <option value="set_timer">System-Timer stellen (Sicher ✓)</option>
                <option value="system_health_report">System-Status abfragen (Sicher ✓)</option>
                <option value="web_search">Websuche simulieren (Sicher ✓)</option>
              </select>
            </div>

            {testTool !== 'system_health_report' && (
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Parameter / Argument
                </label>
                <input
                  type="text"
                  value={testArg}
                  onChange={(e) => setTestArg(e.target.value)}
                  placeholder="URL, Sekunden oder Suchbegriff..."
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 transition flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Tool-Aufruf anfordern
            </button>
          </form>

          {/* Settings */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={settings?.auto_approve_safe_tools ?? true}
                onChange={handleToggleAutoApprove}
                className="rounded border-slate-700 text-cyan-600 focus:ring-0"
              />
              <span>Sichere Tools (Read-Only) ohne Nachfrage genehmigen</span>
            </label>

            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{settings?.countdown_seconds || 25}s Timeout</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom: Tool Execution History / Audit Log */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Tool-Ausführungs- & Audit-Protokoll
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {history.length} Aktionen protokolliert
          </span>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto">
          {history.map((item) => (
            <div
              key={item.call_id}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex items-start justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {item.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-mono font-bold text-slate-200">{item.tool_name}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      item.success
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {item.success ? 'Erfolgreich' : 'Abgewiesen'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">{item.output}</p>
              </div>

              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {new Date(item.executed_at * 1000).toLocaleTimeString()}
              </span>
            </div>
          ))}

          {history.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500 italic">
              Noch keine Tool-Aktionen ausgeführt.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
