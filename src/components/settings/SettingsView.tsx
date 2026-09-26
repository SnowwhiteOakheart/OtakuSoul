import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
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
  FolderOpen,
  Sliders,
  Globe,
  Box,
} from 'lucide-react';

export const SettingsView = () => {
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
    scannedModels,
    scannedVrms,
    activeVrmPath,
    setActiveVrmPath,
    sampling,
    setSampling,
    replyLanguage,
    setReplyLanguage,
    lorebookScanDepth,
    setLorebookScanDepth,
    initApp,
  } = useAppStore();

  const [showLogs, setShowLogs] = useState(true);

  const gpu = hardware?.gpus[0];
  const vramPercent =
    gpu && gpu.total_vram_mb > 0
      ? Math.round(((gpu.total_vram_mb - gpu.free_vram_mb) / gpu.total_vram_mb) * 100)
      : 0;

  const handleRecommendLayers = () => {
    const isLarge = serverConfig.model_path.includes('27B') || serverConfig.model_path.includes('32B');
    const estimatedMb = isLarge ? 16500 : 7500;
    const layers = isLarge ? 64 : 40;
    fetchLayerRecommendation(estimatedMb, layers, serverConfig.context_size);
  };

  const applyRecommendation = () => {
    if (layerRecommendation) {
      setServerConfig({ gpu_layers: layerRecommendation.recommended_layers });
    }
  };

  const handleBrowseModel = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'GGUF Sprachmodelle',
            extensions: ['gguf'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const isLarge = selected.includes('27B') || selected.includes('32B');
        setServerConfig({
          model_path: selected,
          gpu_layers: isLarge ? 50 : 99,
        });
      }
    } catch (e) {
      console.error('Failed to browse model:', e);
    }
  };

  const handleBrowseVrm = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'VRM 3D Avatare',
            extensions: ['vrm'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setActiveVrmPath(selected);
      }
    } catch (e) {
      console.error('Failed to browse VRM:', e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Einstellungen & KI-Orchestrierung
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Verwalte Inferenz, GPU-Layer, Sampler, 3D-Avatare und API-Endpunkte.
            </p>
          </div>
          <button
            onClick={() => {
              fetchHardware();
              initApp();
            }}
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
                <span>CPU:</span>
                <span className="text-slate-200 font-semibold">{hardware?.cpu_name || 'Ermittle...'}</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>RAM:</span>
                <span className="text-slate-200">
                  {hardware ? (hardware.available_ram_mb / 1024).toFixed(1) : 0} GB frei / {hardware ? (hardware.total_ram_mb / 1024).toFixed(1) : 0} GB
                </span>
              </div>
            </div>

            {/* GPU & VRAM */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="text-slate-400 flex items-center justify-between">
                <span>GPU:</span>
                <span className="text-cyan-300 font-semibold">{gpu?.name || 'Keine dedizierte GPU gefunden'}</span>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>VRAM:</span>
                <span className="text-emerald-400 font-medium">
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

          {/* Model Presets / Scanned Models */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Gefundene lokale GGUF-Modelle:</label>
            {scannedModels.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Keine .gguf Modelle in assets/models gefunden.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {scannedModels.map((model, i) => {
                  const isSelected = serverConfig.model_path === model.path;
                  const isLarge = model.path.includes('27B') || model.path.includes('32B');
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setServerConfig({
                          model_path: model.path,
                          gpu_layers: isLarge ? 50 : 99,
                        });
                      }}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'border-purple-500/80 bg-purple-950/30 text-purple-200 shadow-sm'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>{model.name}</span>
                        <span className="text-[10px] text-purple-400 font-mono">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{model.path}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Path Input & Browse */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Aktueller Model-Pfad (.gguf):</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverConfig.model_path}
                onChange={(e) => setServerConfig({ model_path: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={handleBrowseModel}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Durchsuchen...</span>
              </button>
            </div>
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
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0 (Reine CPU)</span>
                <span>Offload (z. B. 50)</span>
                <span>99 (Voller VRAM)</span>
              </div>
            </div>

            {/* Context Size */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Kontextgröße (Tokens):</span>
                <span className="font-mono text-cyan-300 font-bold">{serverConfig.context_size}</span>
              </div>
              <input
                type="range"
                min="2048"
                max="32768"
                step="2048"
                value={serverConfig.context_size}
                onChange={(e) => setServerConfig({ context_size: parseInt(e.target.value) })}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>2k</span>
                <span>8k (Standard)</span>
                <span>32k</span>
              </div>
            </div>
          </div>

          {/* Layer Calculator & Start/Stop Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRecommendLayers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/30 border border-purple-500/40 text-purple-300 hover:bg-purple-900/50 text-xs transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Layer-Kalkulator prüfen</span>
              </button>

              {layerRecommendation && (
                <button
                  onClick={applyRecommendation}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  {layerRecommendation.recommended_layers} Layer anwenden
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {serverStatus.state === 'running' ? (
                <button
                  onClick={() => stopServer()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg shadow-rose-900/30 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Server stoppen</span>
                </button>
              ) : (
                <button
                  onClick={() => startServer()}
                  disabled={serverStatus.state === 'starting' || !serverConfig.model_path}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-purple-900/30 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Server starten</span>
                </button>
              )}
            </div>
          </div>

          {/* Advice Banner */}
          {layerRecommendation && (
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 flex items-start gap-2">
              <Wand2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Empfehlung: </span>
                {layerRecommendation.advice} (Geschätzte VRAM-Belegung: ~{(layerRecommendation.estimated_vram_usage_mb / 1024).toFixed(1)} GB)
              </div>
            </div>
          )}

          {/* Server Logs Drawer */}
          {serverStatus.recent_logs && serverStatus.recent_logs.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <Terminal className="w-3 h-3" />
                <span>{showLogs ? 'Logs ausblenden' : 'Logs einblenden'}</span>
              </button>
              {showLogs && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto space-y-0.5">
                  {serverStatus.recent_logs.map((log, i) => (
                    <div key={i} className="leading-tight text-slate-400">
                      {log}
                    </div>
                  ))}
                </div>
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

        {/* 3. Sampler & Rollenspiel-Parameter */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            Sampler & Rollenspiel-Parameter
          </h2>
          <p className="text-xs text-slate-400">
            Passe Kreativität, Antwortlänge und Lorebook-Verhalten an. Änderungen werden automatisch persistent gespeichert.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Temperature */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-300 font-medium">Temperature:</span>
                <span className="font-mono text-purple-300 font-bold">{sampling.temperature ?? 0.7}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.5"
                step="0.05"
                value={sampling.temperature ?? 0.7}
                onChange={(e) => setSampling({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-purple-500"
              />
              <div className="text-[10px] text-slate-500">Niedrig: Präzise · Hoch: Kreativ</div>
            </div>

            {/* Min-P */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-300 font-medium">Min-P Sampler:</span>
                <span className="font-mono text-cyan-300 font-bold">{sampling.min_p ?? 0.05}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.2"
                step="0.01"
                value={sampling.min_p ?? 0.05}
                onChange={(e) => setSampling({ min_p: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500"
              />
              <div className="text-[10px] text-slate-500">Filtert unpassende Tokens dynamisch heraus</div>
            </div>

            {/* Max Tokens */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-300 font-medium">Max Response Tokens:</span>
                <span className="font-mono text-emerald-300 font-bold">{sampling.max_tokens ?? 2048}</span>
              </div>
              <input
                type="range"
                min="512"
                max="4096"
                step="256"
                value={sampling.max_tokens ?? 2048}
                onChange={(e) => setSampling({ max_tokens: parseInt(e.target.value) })}
                className="w-full accent-emerald-500"
              />
              <div className="text-[10px] text-slate-500">Maximale Länge pro Antwort</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
            {/* Reply Language */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>Antwortsprache des Charakters:</span>
              </label>
              <input
                type="text"
                value={replyLanguage}
                onChange={(e) => setReplyLanguage(e.target.value)}
                placeholder="Deutsch, English, etc."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Lorebook Scan Depth */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Lorebook-Scan-Tiefe (letzte N Nachrichten):</span>
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={lorebookScanDepth}
                onChange={(e) => setLorebookScanDepth(parseInt(e.target.value) || 5)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* 4. 3D Avatar (VRM) Standard-Auswahl */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Box className="w-4 h-4 text-pink-400" />
            3D Avatar (VRM) Standardmodell
          </h2>
          <p className="text-xs text-slate-400">
            Wähle das standardmäßige 3D-Modell für den Three.js Avatar-Viewer.
          </p>

          <div className="flex gap-2 text-xs">
            <select
              value={activeVrmPath || ''}
              onChange={(e) => setActiveVrmPath(e.target.value || null)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
            >
              {scannedVrms.map((vrm, idx) => (
                <option key={idx} value={vrm.path}>
                  {vrm.name} ({(vrm.size_mb).toFixed(0)} MB)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBrowseVrm}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Eigenen VRM wählen...</span>
            </button>
          </div>
        </div>

        {/* 5. Cloud Provider Fallback */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            Cloud API Fallback (Optional)
          </h2>
          <p className="text-xs text-slate-400">
            Wenn Du unterwegs bist oder Cloud-Provider (wie Claude 3.5 Sonnet oder DeepSeek V3) nutzen möchtest.
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
