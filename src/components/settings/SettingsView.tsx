import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
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
  Box,
  Download,
  Search,
  Sparkles,
  Trash2,
  Plus,
  Zap,
  Layers,
  Flame,
  Check,
  Smile,
} from 'lucide-react';
import { LlmProviderType, LlmPreset } from '../../types';
import { api } from '../../services/api';

export const SettingsView = () => {
  const {
    hardware,
    fetchHardware,
    layerRecommendation,
    fetchLayerRecommendation,
    serverStatus,
    serverConfig,
    setServerConfig,
    selectLocalModel,
    startServer,
    stopServer,
    selectedBackend,
    setSelectedBackend,
    cloudProvider,
    setCloudProvider,
    cloudEndpoint,
    setCloudEndpoint,
    cloudApiKey,
    setCloudApiKey,
    cloudModel,
    setCloudModel,
    openRouterModels,
    isLoadingOpenRouterModels,
    fetchOpenRouterModels,
    llmPresets,
    activePresetId,
    applyLlmPreset,
    saveLlmPreset,
    deleteLlmPreset,
    hfSearchResults,
    isSearchingHf,
    hfError,
    searchHfModels,
    hfModelFiles,
    isLoadingHfFiles,
    fetchHfModelFiles,
    downloadProgress,
    downloadGgufModel,
    scannedModels,
    scannedVrms,
    activeVrmPath,
    setActiveVrmPath,
    scannedLive2ds,
    activeLive2dPath,
    setActiveLive2dPath,
    refreshLive2dModels,
    sampling,
    setSampling,
    replyLanguage,
    setReplyLanguage,
    lorebookScanDepth,
    setLorebookScanDepth,
    initApp,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'server' | 'providers' | 'sampler' | 'hub'>('server');
  const [showLogs, setShowLogs] = useState(true);

  // OpenRouter search filter
  const [openRouterSearch, setOpenRouterSearch] = useState('');

  // HuggingFace search
  const BONSAI_MODEL_ID = 'prism-ml/Ternary-Bonsai-27B-gguf';
  const [hfQuery, setHfQuery] = useState('Ternary-Bonsai-27B-gguf');
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [hubView, setHubView] = useState<'recommended' | 'installed' | 'popular' | 'search'>('recommended');

  // New preset modal state
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');

  const gpu = hardware?.gpus[0];
  const vramPercent =
    gpu && gpu.total_vram_mb > 0
      ? Math.round(((gpu.total_vram_mb - gpu.free_vram_mb) / gpu.total_vram_mb) * 100)
      : 0;

  useEffect(() => {
    if (openRouterModels.length === 0 && cloudProvider === 'open_router' && cloudApiKey) {
      fetchOpenRouterModels(cloudApiKey);
    }
  }, [cloudProvider, cloudApiKey]);

  useEffect(() => {
    if (
      activeTab === 'hub' &&
      hubView === 'recommended' &&
      !hfModelFiles[BONSAI_MODEL_ID] &&
      !isLoadingHfFiles[BONSAI_MODEL_ID]
    ) {
      fetchHfModelFiles(BONSAI_MODEL_ID);
    }
  }, [activeTab, hubView]);

  const handleRecommendLayers = () => {
    const selectedModel = scannedModels.find((model) => model.path === serverConfig.model_path);
    const modelName = (selectedModel?.name || serverConfig.model_path).toLowerCase();
    const isBonsai = modelName.includes('ternary-bonsai');
    const isLarge = modelName.includes('27b') || modelName.includes('32b');
    const estimatedMb = selectedModel?.size_mb ?? (isLarge ? 16_500 : 7_500);
    const layers = isBonsai || isLarge ? 64 : 40;
    fetchLayerRecommendation(
      estimatedMb,
      layers,
      serverConfig.context_size,
      serverConfig.model_path,
      serverConfig.cache_type_k ?? 'f16',
      serverConfig.cache_type_v ?? 'f16'
    );
  };

  const applyRecommendation = () => {
    if (layerRecommendation) {
      setServerConfig({
        gpu_layers: layerRecommendation.recommended_layers,
        context_size: layerRecommendation.recommended_context_size,
      });
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
        selectLocalModel(selected);
      }
    } catch (e) {
      console.error('Failed to browse model:', e);
    }
  };

  const showBonsaiRecommendation = () => {
    setHubView('recommended');
    setExpandedModelId(BONSAI_MODEL_ID);
    if (!hfModelFiles[BONSAI_MODEL_ID]) {
      fetchHfModelFiles(BONSAI_MODEL_ID);
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

  const [isImportingSow, setIsImportingSow] = useState(false);
  const [sowImportMsg, setSowImportMsg] = useState<string | null>(null);

  const handleBrowseLive2d = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Live2D Modelle (*.zip, *.model3.json, *.model.json)',
            extensions: ['zip', 'json'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const imported = await api.importLive2dModel(selected);
        await refreshLive2dModels();
        setActiveLive2dPath(imported.model_path);
        setSowImportMsg(`Modell "${imported.name}" erfolgreich importiert!`);
        setTimeout(() => setSowImportMsg(null), 4000);
      }
    } catch (e) {
      console.error('Failed to import Live2D model:', e);
      setSowImportMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setSowImportMsg(null), 5000);
    }
  };

  const handleImportSowLive2d = async () => {
    setIsImportingSow(true);
    setSowImportMsg(null);
    try {
      const count = await api.importSowLive2dModels();
      await refreshLive2dModels();
      setSowImportMsg(`${count} Live2D-Modelle aus Soul of Waifu importiert!`);
      setTimeout(() => setSowImportMsg(null), 4000);
    } catch (e) {
      console.error('Failed to import SoW Live2D models:', e);
      setSowImportMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setSowImportMsg(null), 5000);
    } finally {
      setIsImportingSow(false);
    }
  };

  const handleSaveCustomPreset = async () => {
    if (!newPresetName.trim()) return;
    const presetId = `custom_${Date.now()}`;
    const newPreset: LlmPreset = {
      id: presetId,
      name: newPresetName.trim(),
      description: newPresetDesc.trim() || 'Benutzerdefiniertes Preset',
      is_builtin: false,
      sampling: { ...sampling },
    };
    await saveLlmPreset(newPreset);
    setIsCreatingPreset(false);
    setNewPresetName('');
    setNewPresetDesc('');
  };

  const filteredOpenRouterModels = openRouterModels.filter(
    (m) =>
      m.id.toLowerCase().includes(openRouterSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(openRouterSearch.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              Einstellungen & KI-Orchestrierung
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              llama-server Hardwaretuning, Multi-Provider Routing, Sampler-Presets & Hugging Face GGUF Hub.
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

        {/* Sub-Tabs Navigation */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('server')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'server'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>llama-server & Tuning</span>
          </button>

          <button
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'providers'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Cloud-Provider & Modelle</span>
          </button>

          <button
            onClick={() => setActiveTab('sampler')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'sampler'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Sampler & Presets</span>
          </button>

          <button
            onClick={() => setActiveTab('hub')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'hub'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Models Hub (GGUF)</span>
          </button>
        </div>

        {/* TAB 1: SERVER & HARDWARE TUNING */}
        {activeTab === 'server' && (
          <div className="space-y-6">
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

            {/* 2. llama-server Controller */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Lokaler llama-server Manager
                </h2>

                <div className="flex items-center gap-2">
                  {serverStatus.state === 'running' && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Aktiv (PID {serverStatus.pid} auf Port {serverStatus.port})
                    </span>
                  )}
                  {serverStatus.state === 'starting' && (
                    <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-mono">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Startet...
                    </span>
                  )}
                  {serverStatus.state === 'stopped' && (
                    <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full font-mono">
                      Gestoppt
                    </span>
                  )}
                  {serverStatus.state === 'failed' && (
                    <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-full font-mono">
                      Fehlgeschlagen
                    </span>
                  )}
                </div>
              </div>

              {/* Model File Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">GGUF Modellpfad:</label>
                <div className="flex gap-2">
                  <select
                    value={serverConfig.model_path}
                    onChange={(e) => selectLocalModel(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- Modell wählen oder Durchsuchen --</option>
                    {scannedModels.map((m, idx) => (
                      <option key={idx} value={m.path}>
                        {m.name} ({(m.size_mb / 1024).toFixed(1)} GB · {m.runtime === 'prism' ? 'PrismML' : 'Standard'})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleBrowseModel}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Datei wählen...</span>
                  </button>
                </div>
                {(() => {
                  const selectedModel = scannedModels.find((m) => m.path === serverConfig.model_path);
                  if (!selectedModel) return null;
                  return (
                    <div className={`text-[11px] flex items-center gap-1.5 ${selectedModel.runtime === 'prism' ? 'text-cyan-300' : 'text-slate-500'}`}>
                      <Check className="w-3 h-3" />
                      <span>
                        Runtime: {selectedModel.runtime === 'prism' ? 'PrismML (automatisch)' : 'Standard llama.cpp'} · {selectedModel.compatibility_note}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Core Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Context Size */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Context Size (-c):</label>
                  <select
                    value={serverConfig.context_size}
                    onChange={(e) => setServerConfig({ context_size: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                  >
                    <option value={2048}>2048 Tokens</option>
                    <option value={4096}>4096 Tokens</option>
                    <option value={8192}>8192 Tokens</option>
                    <option value={16384}>16384 Tokens</option>
                    <option value={32768}>32768 Tokens (KV-Quant empfohlen)</option>
                    <option value={65536}>65536 Tokens</option>
                    <option value={131072}>131072 Tokens (viel RAM/VRAM)</option>
                    <option value={262144}>262144 Tokens (Modellmaximum, experimentell)</option>
                  </select>
                </div>

                {/* GPU Layers */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-300 font-medium">GPU Layers (-ngl):</label>
                    <span className="font-mono text-cyan-400 font-bold">{serverConfig.gpu_layers}</span>
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
                    <span>0 (Nur CPU)</span>
                    <span>50 (Teil-Offload)</span>
                    <span>99 (Max VRAM)</span>
                  </div>
                </div>

                {/* Port */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Port:</label>
                  <input
                    type="number"
                    value={serverConfig.port}
                    onChange={(e) => setServerConfig({ port: parseInt(e.target.value) || 48596 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Advanced Server Tuning Section */}
              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-3">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hardware & VRAM Tuning (llama.cpp Flags)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Batch Size */}
                  <div className="space-y-1">
                    <label className="text-slate-400">Batch Size (-b):</label>
                    <select
                      value={serverConfig.batch_size ?? 2048}
                      onChange={(e) => setServerConfig({ batch_size: parseInt(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                    >
                      <option value={512}>512 (Minimal VRAM)</option>
                      <option value={1024}>1024 (Ausgewogen)</option>
                      <option value={2048}>2048 (Schnelle Prompts)</option>
                      <option value={4096}>4096 (High-End)</option>
                    </select>
                  </div>

                  {/* UBatch Size */}
                  <div className="space-y-1">
                    <label className="text-slate-400">UBatch Size (-ub):</label>
                    <select
                      value={serverConfig.ubatch_size ?? 512}
                      onChange={(e) => setServerConfig({ ubatch_size: parseInt(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                    >
                      <option value={256}>256</option>
                      <option value={512}>512 (Standard)</option>
                      <option value={1024}>1024</option>
                    </select>
                  </div>

                  {/* KV Cache K Quantization */}
                  <div className="space-y-1">
                    <label className="text-slate-400">KV Cache Quant (K/V):</label>
                    <select
                      value={serverConfig.cache_type_k ?? 'f16'}
                      onChange={(e) =>
                        setServerConfig({
                          cache_type_k: e.target.value,
                          cache_type_v: e.target.value,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                    >
                      <option value="f16">f16 (Standard Präzision)</option>
                      <option value="q8_0">q8_0 (~50% VRAM Ersparnis)</option>
                      <option value="q4_0">q4_0 (~70% VRAM Ersparnis)</option>
                    </select>
                  </div>
                </div>

                {/* Checkboxes row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serverConfig.flash_attn}
                      onChange={(e) => setServerConfig({ flash_attn: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                    />
                    <span className="text-slate-300">Flash Attention (-fa)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serverConfig.mlock ?? false}
                      onChange={(e) => setServerConfig({ mlock: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                    />
                    <span className="text-slate-300">Lock RAM (--mlock)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serverConfig.cpu_moe ?? false}
                      onChange={(e) => setServerConfig({ cpu_moe: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                    />
                    <span className="text-slate-300">CPU-MoE Offload</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serverConfig.reasoning_mode ?? false}
                      onChange={(e) => setServerConfig({ reasoning_mode: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                    />
                    <span className="text-slate-300">Reasoning/Denkmodus</span>
                  </label>
                </div>
              </div>

              {/* Layer Recommendation Box */}
              <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-900/40 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Automatische GPU-VRAM-Kalkulation</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {layerRecommendation
                      ? layerRecommendation.advice
                      : 'Berechnet Layer und Kontext anhand der echten Modellgröße und des KV-Cache-Typs.'}
                  </div>
                  {layerRecommendation && (
                    <div className="text-[10px] text-slate-500">
                      {layerRecommendation.profile_name} · Modell {(layerRecommendation.estimated_model_vram_mb / 1024).toFixed(1)} GiB
                      {' + '}KV {(layerRecommendation.estimated_context_vram_mb / 1024).toFixed(1)} GiB
                      {' + '}Runtime {(layerRecommendation.runtime_overhead_mb / 1024).toFixed(1)} GiB
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRecommendLayers}
                    className="px-3 py-1.5 rounded bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-xs font-medium border border-purple-700/50 transition-colors"
                  >
                    Kalkulieren
                  </button>
                  {layerRecommendation && (
                    <button
                      type="button"
                      onClick={applyRecommendation}
                      className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
                    >
                      Anwenden ({layerRecommendation.recommended_layers} Layer · {Math.round(layerRecommendation.recommended_context_size / 1024)}K)
                    </button>
                  )}
                </div>
              </div>

              {/* Start/Stop Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={serverStatus.state === 'running' || serverStatus.state === 'starting' || !serverConfig.model_path}
                  onClick={startServer}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/40"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>llama-server Starten</span>
                </button>

                <button
                  type="button"
                  disabled={serverStatus.state === 'stopped'}
                  onClick={stopServer}
                  className="py-2.5 px-6 rounded-lg bg-rose-600/80 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Beenden</span>
                </button>
              </div>

              {/* Error Message */}
              {serverStatus.error_message && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Fehler beim Starten:
                  </div>
                  <div className="font-mono text-[11px] whitespace-pre-wrap">{serverStatus.error_message}</div>
                </div>
              )}

              {/* Server Live Logs */}
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/80 text-xs font-semibold text-slate-300 hover:bg-slate-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-purple-400" />
                    <span>Live Server-Log Konsole ({serverStatus.recent_logs.length} Einträge)</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{showLogs ? 'Einklappen' : 'Ausklappen'}</span>
                </button>

                {showLogs && (
                  <div className="p-3 font-mono text-[11px] text-slate-300 h-44 overflow-y-auto space-y-0.5 bg-slate-950/90 leading-tight">
                    {serverStatus.recent_logs.length === 0 ? (
                      <div className="text-slate-600 italic">Noch keine Logs empfangen...</div>
                    ) : (
                      serverStatus.recent_logs.map((log, idx) => (
                        <div key={idx} className="whitespace-pre-wrap hover:bg-slate-900/40 py-0.5 px-1 rounded">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLOUD PROVIDERS & OPENROUTER SEARCH */}
        {activeTab === 'providers' && (
          <div className="space-y-6">
            {/* Backend Switch */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                Aktiver Inferenz-Modus
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  onClick={() => setSelectedBackend('local')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedBackend === 'local'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Lokaler llama-server</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Volle Privatsphäre, 100% offline, GPU-beschleunigt.
                  </div>
                </button>

                <button
                  onClick={() => setSelectedBackend('cloud')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedBackend === 'cloud'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cloud-Provider Routing</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    OpenRouter, Claude 3.5 Sonnet, GPT-4o, DeepSeek V3.
                  </div>
                </button>
              </div>
            </div>

            {/* Provider Configuration */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Provider & Endpunkt Konfiguration
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Provider Type */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Provider Protokoll:</label>
                  <select
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value as LlmProviderType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="open_router">OpenRouter (Große Modellauswahl)</option>
                    <option value="anthropic">Anthropic Claude (Native Messages API)</option>
                    <option value="open_ai">OpenAI (GPT-4o, o1, o3)</option>
                    <option value="deep_seek">DeepSeek (V3, R1)</option>
                    <option value="gemini">Google Gemini (OpenAI-kompatibel)</option>
                    <option value="mistral">Mistral AI</option>
                    <option value="custom">Benutzerdefinierter OpenAI-Endpunkt</option>
                  </select>
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">API Key:</label>
                  <input
                    type="password"
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                    placeholder="sk-or-... oder sk-ant-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Endpunkt URL:</label>
                  <input
                    type="text"
                    value={cloudEndpoint}
                    onChange={(e) => setCloudEndpoint(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Model Identifier */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Modell Identifier:</label>
                  <input
                    type="text"
                    value={cloudModel}
                    onChange={(e) => setCloudModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* OpenRouter Model Catalog Integration */}
              {cloudProvider === 'open_router' && (
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span>OpenRouter Modellkatalog</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Durchsuche über 200 Modelle und übernimm sie mit 1 Klick.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isLoadingOpenRouterModels}
                      onClick={() => fetchOpenRouterModels()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOpenRouterModels ? 'animate-spin' : ''}`} />
                      <span>{openRouterModels.length > 0 ? 'Aktualisieren' : 'Katalog laden'}</span>
                    </button>
                  </div>

                  {openRouterModels.length > 0 && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                        <input
                          type="text"
                          value={openRouterSearch}
                          onChange={(e) => setOpenRouterSearch(e.target.value)}
                          placeholder="Modell suchen (z.B. claude, deepseek, llama, qwen, wizard)..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div className="h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800/60 text-xs">
                        {filteredOpenRouterModels.slice(0, 50).map((m) => (
                          <div
                            key={m.id}
                            onClick={() => setCloudModel(m.id)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors ${
                              cloudModel === m.id ? 'bg-purple-950/40 text-purple-300' : 'text-slate-300'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold flex items-center gap-1.5">
                                <span>{m.name}</span>
                                {cloudModel === m.id && <Check className="w-3.5 h-3.5 text-purple-400" />}
                              </div>
                              <div className="font-mono text-[10px] text-slate-500">{m.id}</div>
                            </div>

                            <div className="text-right font-mono text-[11px] text-slate-400">
                              <span>{(m.context_length / 1024).toFixed(0)}k Context</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SAMPLER & LLM PRESETS */}
        {activeTab === 'sampler' && (
          <div className="space-y-6">
            {/* Presets Manager Bar */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    Sampler & Preset-Profile
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Wähle aus Standard-Profilen oder erstelle eigene Preset-Konfigurationen.
                  </p>
                </div>

                <button
                  onClick={() => setIsCreatingPreset(true)}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Als neues Preset speichern</span>
                </button>
              </div>

              {/* Preset Selector Badges */}
              <div className="flex flex-wrap gap-2 pt-1">
                {llmPresets.map((p) => {
                  const isActive = activePresetId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span onClick={() => applyLlmPreset(p.id)} className="font-medium">
                        {p.name}
                      </span>
                      {!p.is_builtin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLlmPreset(p.id);
                          }}
                          className="hover:text-rose-400 ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal / Inline form to save custom preset */}
              {isCreatingPreset && (
                <div className="p-3 rounded-lg border border-purple-800/60 bg-purple-950/30 space-y-2 text-xs">
                  <div className="font-semibold text-purple-200">Neues Preset anlegen</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Preset Name (z.B. Mein Slow-Burn Preset)..."
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                    <input
                      type="text"
                      placeholder="Beschreibung..."
                      value={newPresetDesc}
                      onChange={(e) => setNewPresetDesc(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsCreatingPreset(false)}
                      className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleSaveCustomPreset}
                      className="px-3 py-1 rounded bg-purple-600 text-white font-medium"
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Standard Samplers */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Klassische Sampling-Parameter</span>
              </h3>

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
                    max="0.3"
                    step="0.01"
                    value={sampling.min_p ?? 0.05}
                    onChange={(e) => setSampling({ min_p: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Filtert unpassende Tokens dynamisch</div>
                </div>

                {/* Top-P */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Top-P (Nucleus):</span>
                    <span className="font-mono text-emerald-300 font-bold">{sampling.top_p ?? 0.9}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={sampling.top_p ?? 0.9}
                    onChange={(e) => setSampling({ top_p: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                  <div className="text-[10px] text-slate-500">Kumulative Wahrscheinlichkeitsschwelle</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Max Tokens */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Max Output Tokens:</span>
                    <span className="font-mono text-emerald-300 font-bold">{sampling.max_tokens ?? 2048}</span>
                  </div>
                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="256"
                    value={sampling.max_tokens ?? 2048}
                    onChange={(e) => setSampling({ max_tokens: parseInt(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                  <div className="text-[10px] text-slate-500">Maximale Antwortlänge</div>
                </div>

                {/* Repeat Penalty */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Repeat Penalty:</span>
                    <span className="font-mono text-amber-300 font-bold">{sampling.repeat_penalty ?? 1.1}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="1.5"
                    step="0.02"
                    value={sampling.repeat_penalty ?? 1.1}
                    onChange={(e) => setSampling({ repeat_penalty: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                  <div className="text-[10px] text-slate-500">Verhindert Wort-Wiederholungen</div>
                </div>

                {/* Top-K */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Top-K:</span>
                    <span className="font-mono text-indigo-300 font-bold">{sampling.top_k ?? 40}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={sampling.top_k ?? 40}
                    onChange={(e) => setSampling({ top_k: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                  <div className="text-[10px] text-slate-500">0 = deaktiviert</div>
                </div>
              </div>
            </div>

            {/* Advanced Samplers: DRY & XTC & Dynatemp */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>Erweiterte Sampler (DRY, XTC & Dynamic Temperature)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* DRY (Don't Repeat Yourself) Multiplier */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">DRY Multiplier:</span>
                    <span className="font-mono text-rose-300 font-bold">{sampling.dry_multiplier ?? 0.8}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.05"
                    value={sampling.dry_multiplier ?? 0.8}
                    onChange={(e) => setSampling({ dry_multiplier: parseFloat(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                  <div className="text-[10px] text-slate-500">
                    Unterdrückt repetitive Schleifen basierend auf N-Grammen (0 = Aus).
                  </div>
                </div>

                {/* XTC (Exclude Top Choices) Threshold */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">XTC Threshold:</span>
                    <span className="font-mono text-cyan-300 font-bold">{sampling.xtc_threshold ?? 0.1}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.5"
                    step="0.02"
                    value={sampling.xtc_threshold ?? 0.1}
                    onChange={(e) => setSampling({ xtc_threshold: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">
                    Verhindert klischeehafte Phrasen und fördert unerwartete Wortwahl.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Dynatemp Range */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Dynamic Temperature Range:</span>
                    <span className="font-mono text-purple-300 font-bold">{sampling.dynatemp_range ?? 0.0}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.8"
                    step="0.05"
                    value={sampling.dynatemp_range ?? 0.0}
                    onChange={(e) => setSampling({ dynatemp_range: parseFloat(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                  <div className="text-[10px] text-slate-500">
                    Schwankt dynamisch zwischen Temp - Range und Temp + Range (0 = Aus).
                  </div>
                </div>

                {/* Reply Language & Lorebook Depth */}
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium">Antwortsprache:</span>
                    <input
                      type="text"
                      value={replyLanguage}
                      onChange={(e) => setReplyLanguage(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-xs w-32"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium">Lorebook Scan-Tiefe:</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={lorebookScanDepth}
                      onChange={(e) => setLorebookScanDepth(parseInt(e.target.value) || 5)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-xs w-20 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3D Avatar (VRM) Standard-Auswahl */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-pink-400" />
                <span>3D Avatar (VRM) Standardmodell</span>
              </h3>
              <div className="flex gap-2 text-xs">
                <select
                  value={activeVrmPath || ''}
                  onChange={(e) => setActiveVrmPath(e.target.value || null)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {scannedVrms.map((vrm, idx) => (
                    <option key={idx} value={vrm.path}>
                      {vrm.name} ({vrm.size_mb.toFixed(0)} MB)
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

            {/* 2D Live2D Standard-Auswahl & Import */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-purple-400" />
                  <span>2D Live2D Standardmodell</span>
                </h3>
                {sowImportMsg && (
                  <span className="text-[11px] text-purple-300 font-mono animate-fade-in bg-purple-950/70 px-2 py-0.5 rounded border border-purple-500/40">
                    {sowImportMsg}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <select
                  value={activeLive2dPath || ''}
                  onChange={(e) => setActiveLive2dPath(e.target.value || null)}
                  className="flex-1 min-w-[200px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {scannedLive2ds.map((l2d, idx) => (
                    <option key={idx} value={l2d.model_path}>
                      {l2d.name} ({l2d.id})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleBrowseLive2d}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                  title="ZIP-Archiv oder .model3.json Datei eines Live2D-Modells importieren"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                  <span>Eigenes Live2D-Modell importieren...</span>
                </button>

                <button
                  type="button"
                  onClick={handleImportSowLive2d}
                  disabled={isImportingSow}
                  className="px-3.5 py-2 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 font-medium flex items-center gap-1.5 transition-colors border border-purple-700/60 disabled:opacity-50"
                  title="Kopiert alle installierten Live2D-Modelle aus Soul-of-Waifu"
                >
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  <span>{isImportingSow ? 'Importiere...' : 'Aus Soul-of-Waifu importieren'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MODELS HUB (HUGGING FACE GGUF) */}
        {activeTab === 'hub' && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  Hugging Face GGUF Download Manager
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Suche Sprachmodelle direkt auf Hugging Face und lade sie in Deinen lokalen <code>assets/models</code> Ordner.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={showBonsaiRecommendation}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${hubView === 'recommended' ? 'border-purple-500 bg-purple-500/15 text-purple-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                >
                  ✨ Empfehlungen
                </button>
                <button
                  onClick={() => setHubView('installed')}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${hubView === 'installed' ? 'border-purple-500 bg-purple-500/15 text-purple-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                >
                  Meine Modelle ({scannedModels.length})
                </button>
                <button
                  onClick={() => {
                    setHubView('popular');
                    searchHfModels('');
                  }}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${hubView === 'popular' ? 'border-purple-500 bg-purple-500/15 text-purple-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                >
                  Beliebt
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={hfQuery}
                    onChange={(e) => {
                      setHfQuery(e.target.value);
                      setHubView('search');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setHubView('search');
                        searchHfModels(hfQuery);
                      }
                    }}
                    placeholder="Modell suchen (z.B. Qwen2.5-7B, Llama-3.1-8B, Mistral, Heretic)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setHubView('search');
                    searchHfModels(hfQuery);
                  }}
                  disabled={isSearchingHf || !hfQuery.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isSearchingHf ? 'Suche...' : 'Modelle suchen'}</span>
                </button>
              </div>
            </div>

            {hfError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{hfError}</span>
              </div>
            )}

            {hubView === 'recommended' && (() => {
              const files = hfModelFiles[BONSAI_MODEL_ID] || [];
              const recommendedFile = files.find((file) => file.recommended);
              const installed = scannedModels.find((model) => model.name.toLowerCase().includes('ternary-bonsai-27b-pq2_0'));
              const vramGb = (gpu?.total_vram_mb || 0) / 1024;
              return (
                <div className="rounded-2xl border border-purple-500/50 bg-gradient-to-br from-purple-950/60 via-slate-900/80 to-cyan-950/40 p-5 space-y-4 shadow-xl shadow-purple-950/20">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">ERSTE WAHL</span>
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">PRISM PQ2_0</span>
                        <span className="text-[10px] text-slate-400">Apache-2.0</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-100">Ternary Bonsai 27B</h3>
                      <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                        Volles 27B-Reasoning bei nur etwa 7,2 GB Modellgröße. Unterstützt bis zu 262K Kontext; OtakuSoul startet sicher mit 32K und 4-Bit-KV-Cache.
                      </p>
                    </div>
                    <div className="text-xs md:text-right space-y-1">
                      <div className="text-emerald-300 font-semibold">
                        {vramGb >= 10 ? `✓ Passt vollständig in ${vramGb.toFixed(0)} GB VRAM` : '✓ Läuft mit CPU/GPU-Offload'}
                      </div>
                      <div className="text-slate-400">ca. 8,4 GB Peak bei 4K · ca. 10,1 GB bei 100K + Q4 KV</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                    {[['27B', 'Parameter'], ['~7,2 GB', 'Download'], ['32K', 'Startkontext'], ['262K', 'Maximum']].map(([value, label]) => (
                      <div key={label} className="rounded-lg bg-slate-950/60 border border-slate-700/70 p-2 text-center">
                        <div className="font-bold text-slate-100">{value}</div>
                        <div className="text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {installed ? (
                      <button
                        onClick={() => {
                          selectLocalModel(installed.path);
                          setActiveTab('server');
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Installiert – auswählen
                      </button>
                    ) : recommendedFile ? (
                      <button
                        onClick={() => downloadGgufModel(recommendedFile.download_url, recommendedFile.filename)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> Empfohlenes Modell laden & auswählen
                      </button>
                    ) : (
                      <button
                        onClick={showBonsaiRecommendation}
                        disabled={isLoadingHfFiles[BONSAI_MODEL_ID]}
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingHfFiles[BONSAI_MODEL_ID] ? 'animate-spin' : ''}`} />
                        {isLoadingHfFiles[BONSAI_MODEL_ID] ? 'Lade Modelldaten...' : 'Download vorbereiten'}
                      </button>
                    )}
                    <button type="button" onClick={() => openUrl('https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf')} className="px-3 py-2 text-xs text-cyan-300 hover:text-cyan-200">
                      Modellseite öffnen ↗
                    </button>
                  </div>

                  {files.length > 0 && !installed && (
                    <div className="pt-3 border-t border-purple-500/20 text-[11px] text-slate-400">
                      Gewählt: <span className="font-mono text-purple-200">{recommendedFile?.filename || 'PQ2_0 wird gesucht'}</span>. Die spezielle PrismML Runtime wird automatisch verwendet.
                    </div>
                  )}
                </div>
              );
            })()}

            {hubView === 'installed' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scannedModels.map((model) => (
                  <button
                    key={model.path}
                    onClick={() => {
                      selectLocalModel(model.path);
                      setActiveTab('server');
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${serverConfig.model_path === model.path ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="font-semibold text-xs text-slate-200 break-all">{model.name}</div>
                      {serverConfig.model_path === model.path && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      <span className={`px-2 py-0.5 rounded ${model.runtime === 'prism' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-purple-500/15 text-purple-300'}`}>
                        {model.runtime === 'prism' ? 'PrismML' : 'llama.cpp'}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500">Klicken zum Auswählen und Konfigurieren</div>
                  </button>
                ))}
              </div>
            )}

            {/* Active Downloads Section */}
            {Object.keys(downloadProgress).length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Laufende / Abgeschlossene Downloads</span>
                </h3>

                <div className="space-y-2">
                  {Object.values(downloadProgress).map((prog) => (
                    <div key={prog.filename} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200 truncate max-w-md">{prog.filename}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400">{prog.speed_mbps.toFixed(1)} MB/s</span>
                          {prog.finished ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              Fertig
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                              {prog.percent.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            prog.finished ? 'bg-emerald-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>
                          {(prog.downloaded_bytes / (1024 * 1024)).toFixed(1)} MB / {(prog.total_bytes / (1024 * 1024)).toFixed(1)} MB
                        </span>
                        {prog.eta_seconds && prog.eta_seconds > 0 && <span>ETA: ~{prog.eta_seconds}s</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {(hubView === 'search' || hubView === 'popular') && (
            <div className="space-y-3">
              {hfSearchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs">
                  Gib einen Suchbegriff ein, um GGUF-Modelle auf Hugging Face zu finden.
                </div>
              ) : (
                hfSearchResults.map((model) => {
                  const isExpanded = expandedModelId === model.id;
                  const files = hfModelFiles[model.id] || [];
                  const isLoadingFiles = isLoadingHfFiles[model.id];

                  return (
                    <div key={model.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-200 text-xs flex items-center gap-2">
                            <span>{model.id}</span>
                            <span className="text-[10px] text-slate-500">von {model.author}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-3">
                            <span>Downloads: {model.downloads.toLocaleString()}</span>
                            <span>Likes: {model.likes.toLocaleString()}</span>
                            {model.last_modified && (
                              <span>Update: {model.last_modified.slice(0, 10)}</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedModelId(null);
                            } else {
                              setExpandedModelId(model.id);
                              if (files.length === 0) {
                                fetchHfModelFiles(model.id);
                              }
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <span>{isExpanded ? 'Dateien schließen' : 'GGUF-Dateien anzeigen'}</span>
                        </button>
                      </div>

                      {/* Expanded Files */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          {isLoadingFiles ? (
                            <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Lade Dateiliste von Hugging Face...</span>
                            </div>
                          ) : files.length === 0 ? (
                            <div className="py-2 text-center text-xs text-slate-500">
                              Keine .gguf Dateien in diesem Repository gefunden.
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                              {files.map((file) => (
                                <div key={file.filename} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-900/50">
                                  <div className="space-y-1 min-w-0 flex-1 pr-3">
                                    <div className="font-semibold text-slate-200 break-all flex items-center gap-2">
                                      <span>{file.filename}</span>
                                      {file.recommended && <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">EMPFOHLEN</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-mono">
                                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                                        {file.quantization}
                                      </span>
                                      <span className="text-slate-400">{file.size_formatted}</span>
                                      <span className={file.runtime === 'prism' ? 'text-cyan-300' : file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-500'}>
                                        {file.runtime === 'prism' ? 'PrismML Runtime' : file.runtime === 'legacy' ? 'Veraltet' : 'Standard Runtime'}
                                      </span>
                                    </div>
                                    <div className={`text-[10px] ${file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-500'}`}>{file.compatibility_note}</div>
                                  </div>

                                  <button
                                    onClick={() => downloadGgufModel(file.download_url, file.filename)}
                                    disabled={file.runtime === 'legacy'}
                                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>{file.runtime === 'legacy' ? 'Nicht verwenden' : 'Laden & auswählen'}</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
