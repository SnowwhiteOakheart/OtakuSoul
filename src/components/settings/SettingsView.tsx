import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Cpu,
  HardDrive,
  Play,
  Square,
  Wand2,
  Terminal,
  Key,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    hardware,
    fetchHardware,
    layerRecommendation,
    fetchLayerRecommendation,
    serverStatus,
    serverConfig,
    setServerConfig,
    startServer,
    stopServer,
    cloudEndpoint,
    setCloudEndpoint,
    cloudApiKey,
    setCloudApiKey,
    cloudModel,
    setCloudModel,
  } = useAppStore();

  const [showLogs, setShowLogs] = useState(true);

  const gpu = hardware?.gpus[0];
  const vramPercent =
    gpu && gpu.total_vram_mb > 0
      ? Math.round(((gpu.total_vram_mb - gpu.free_vram_mb) / gpu.total_vram_mb) * 100)
      : 0;

  const handleRecommendLayers = () => {
    // Estimate model size for 12B Q4 (~7500MB) or 27B Q4 (~16000MB)
    const isQwen = serverConfig.model_path.includes('27B');
    const estimatedMb = isQwen ? 16500 : 7500;
    const layers = isQwen ? 64 : 40;
    fetchLayerRecommendation(estimatedMb, layers, serverConfig.context_size);
  };

  const applyRecommendation = () => {
    if (layerRecommendation) {
      setServerConfig({ gpu_layers: layerRecommendation.recommended_layers });
    }
  };

  const detectedPresets = [
    {
      name: 'Gemma 4 12B QAT (Ausgewogen & Schnell)',
      path: '/home/deathtrap/development/Soul-of-Waifu-linux/assets/local_llm/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf',
    },
    {
      name: 'Qwen 3.8 27B Heretic (Tiefe & Rollenspiel)',
      path: '/home/deathtrap/development/Soul-of-Waifu-linux/assets/local_llm/Qwen3.8-27B-Heretic-Q4_K_M.gguf',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Hardware- & LLM-Orchestrierung
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Verwalte Inferenz, GPU-Layer-Verteilung und API-Endpunkte für OtakuSoul.
            </p>
          </div>
          <button
            onClick={() => fetchHardware()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Aktualisieren</span>
          </button>
        </div>

        {/* 1. Hardware Status Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            Erkannte Systemressourcen
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* CPU & RAM */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="text-slate-400 flex items-center justify-between">
                <span>Betriebssystem:</span>
                <span className="text-slate-200">{hardware?.os_name} {hardware?.os_version}</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>Prozessor:</span>
                <span className="text-slate-200">{hardware?.cpu_name} ({hardware?.cpu_cores} Kerne)</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>Arbeitsspeicher (RAM):</span>
                <span className="text-slate-200">
                  {hardware ? Math.round(hardware.available_ram_mb / 1024) : 0} GB frei / {hardware ? Math.round(hardware.total_ram_mb / 1024) : 0} GB
                </span>
              </div>
            </div>

            {/* GPU & VRAM */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="text-slate-400 flex items-center justify-between">
                <span>Grafikkarte:</span>
                <span className="text-emerald-400 font-semibold">{gpu?.name || 'Keine GPU erkannt'}</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>VRAM Auslastung:</span>
                <span className="text-slate-200">
                  {gpu ? (gpu.free_vram_mb / 1024).toFixed(1) : 0} GB frei / {gpu ? (gpu.total_vram_mb / 1024).toFixed(1) : 0} GB
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-1">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vramPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Local Llama-Server Controller */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Lokaler llama-server Manager
            </h2>

            {/* Server Status Indicator */}
            <div className="flex items-center gap-2">
              {serverStatus.state === 'running' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Aktiv (PID {serverStatus.pid} auf Port {serverStatus.port})
                </span>
              )}
              {serverStatus.state === 'starting' && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-mono">
                  Initialisiere Modell...
                </span>
              )}
              {serverStatus.state === 'stopped' && (
                <span className="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full font-mono">
                  Gestoppt
                </span>
              )}
            </div>
          </div>

          {/* Model Presets */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Gefundene lokale GGUF-Modelle:</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {detectedPresets.map((preset, i) => (
                <div
                  key={i}
                  onClick={() => setServerConfig({ model_path: preset.path })}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    serverConfig.model_path === preset.path
                      ? 'border-purple-500/80 bg-purple-950/30 text-purple-200 shadow-sm'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-slate-200">{preset.name}</div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{preset.path}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Path Input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Manueller Model-Pfad (.gguf):</label>
            <input
              type="text"
              value={serverConfig.model_path}
              onChange={(e) => setServerConfig({ model_path: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* GPU Layers & Context Size */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GPU Layers */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">GPU Layers (n_gpu_layers):</span>
                <span className="font-mono text-purple-300 font-bold">{serverConfig.gpu_layers}</span>
              </div>
              <input
                type="range"
                min="0"
                max="99"
                value={serverConfig.gpu_layers}
                onChange={(e) => setServerConfig({ gpu_layers: parseInt(e.target.value) })}
                className="w-full accent-purple-500"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={handleRecommendLayers}
                  className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 underline"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Automatisch berechnen</span>
                </button>
                <span className="text-[11px] text-slate-500">99 = Vollständig auf GPU</span>
              </div>

              {/* Recommendation Box */}
              {layerRecommendation && (
                <div className="mt-2 p-2 rounded bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200 space-y-1">
                  <p>{layerRecommendation.advice}</p>
                  <button
                    onClick={applyRecommendation}
                    className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium text-[10px] mt-1"
                  >
                    Empfehlung ({layerRecommendation.recommended_layers} Layer) anwenden
                  </button>
                </div>
              )}
            </div>

            {/* Context Size & Port */}
            <div className="space-y-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Kontextgröße (Tokens):</label>
                <select
                  value={serverConfig.context_size}
                  onChange={(e) => setServerConfig({ context_size: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value={2048}>2048 Tokens (Minimal)</option>
                  <option value={4096}>4096 Tokens (Standard)</option>
                  <option value={8192}>8192 Tokens (Erweitert)</option>
                  <option value={16384}>16384 Tokens (Großes Gedächtnis)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="text-xs font-medium text-slate-300">Flash Attention aktivieren:</label>
                <input
                  type="checkbox"
                  checked={serverConfig.flash_attn}
                  onChange={(e) => setServerConfig({ flash_attn: e.target.checked })}
                  className="rounded accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Server Actions */}
          <div className="flex items-center gap-3 pt-2">
            {serverStatus.state === 'running' ? (
              <button
                onClick={stopServer}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Server Beenden</span>
              </button>
            ) : (
              <button
                onClick={startServer}
                disabled={serverStatus.state === 'starting'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium shadow-md transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{serverStatus.state === 'starting' ? 'Startet...' : 'Server Starten'}</span>
              </button>
            )}

            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{showLogs ? 'Logs verbergen' : 'Logs anzeigen'}</span>
            </button>
          </div>

          {/* Terminal Logs Drawer */}
          {showLogs && (
            <div className="mt-3 p-3 rounded-lg bg-black/90 border border-slate-800 font-mono text-[11px] text-slate-400 max-h-48 overflow-y-auto space-y-0.5">
              {serverStatus.recent_logs.length === 0 ? (
                <div className="text-slate-600 italic">Noch keine Server-Logs vorhanden...</div>
              ) : (
                serverStatus.recent_logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap leading-tight">
                    {log}
                  </div>
                ))
              )}
            </div>
          )}

          {serverStatus.error_message && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Fehler beim Starten:
              </div>
              <div className="font-mono text-[11px] whitespace-pre-wrap">{serverStatus.error_message}</div>
            </div>
          )}
        </div>

        {/* 3. Cloud Provider Fallback */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            Cloud API Fallback (Optional)
          </h2>
          <p className="text-xs text-slate-400">
            Wenn Du unterwegs bist oder größere Reasoning-Modelle (wie Claude 3.5 Sonnet oder DeepSeek V3) nutzen möchtest.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300">API Endpunkt:</label>
              <input
                type="text"
                value={cloudEndpoint}
                onChange={(e) => setCloudEndpoint(e.target.value)}
                placeholder="https://openrouter.ai/api/v1/chat/completions"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300">Modell-Identifier:</label>
              <input
                type="text"
                value={cloudModel}
                onChange={(e) => setCloudModel(e.target.value)}
                placeholder="anthropic/claude-3.5-sonnet"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <label className="text-slate-300">API Key:</label>
            <input
              type="password"
              value={cloudApiKey}
              onChange={(e) => setCloudApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
