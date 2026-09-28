import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Cpu,
  HardDrive,
  Play,
  Square,
  Wand2,
  Terminal,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  Zap,
  Check,
} from 'lucide-react';

export const ServerSettings = () => {
  const { t } = useTranslation();
  const {
    hardware, layerRecommendation, fetchLayerRecommendation, serverStatus, serverConfig,
    setServerConfig, selectLocalModel, startServer, stopServer, scannedModels,
  } = useStoreFields(
    'hardware', 'layerRecommendation', 'fetchLayerRecommendation', 'serverStatus', 'serverConfig',
    'setServerConfig', 'selectLocalModel', 'startServer', 'stopServer', 'scannedModels',
  );

  const [showLogs, setShowLogs] = useState(true);
  const gpu = hardware?.gpus[0];

  const vramPercent =
    gpu && gpu.total_vram_mb > 0
      ? Math.round(((gpu.total_vram_mb - gpu.free_vram_mb) / gpu.total_vram_mb) * 100)
      : 0;

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
            name: translate('settings.fileFilterGguf'),
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

  return (
    <div className="space-y-6">
      {/* 1. Hardware Status Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          {t('settings.hardwareTitle')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* CPU & RAM */}
          <div className="p-3 rounded-lg bg-app/60 border border-slate-800/80 space-y-2">
            <div className="text-slate-400 flex items-center justify-between">
              <span>CPU:</span>
              <span className="text-slate-200 font-semibold">{hardware?.cpu_name || t('settings.detecting')}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between">
              <span>RAM:</span>
              <span className="text-slate-200">
                {t('settings.freeOf', {
                  free: hardware ? (hardware.available_ram_mb / 1024).toFixed(1) : 0,
                  total: hardware ? (hardware.total_ram_mb / 1024).toFixed(1) : 0,
                })}
              </span>
            </div>
          </div>

          {/* GPU & VRAM */}
          <div className="p-3 rounded-lg bg-app/60 border border-slate-800/80 space-y-2">
            <div className="text-slate-400 flex items-center justify-between">
              <span>GPU:</span>
              <span className="text-cyan-300 font-semibold">{gpu?.name || t('settings.noGpu')}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between">
              <span>VRAM:</span>
              <span className="text-emerald-400 font-medium">
                {t('settings.freeOf', {
                  free: gpu ? (gpu.free_vram_mb / 1024).toFixed(1) : 0,
                  total: gpu ? (gpu.total_vram_mb / 1024).toFixed(1) : 0,
                })}
              </span>
            </div>

            {/* Progress bar */}
            <div
              role="progressbar"
              aria-label={t('settings.vramUsage')}
              aria-valuenow={Math.round(vramPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-1"
            >
              <div
                className="bg-linear-to-r from-emerald-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
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
            <Cpu className="w-4 h-4 text-accent-400" />
            {t('settings.serverTitle')}
          </h2>

          <div className="flex items-center gap-2">
            {serverStatus.state === 'running' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {t('settings.serverRunning', { pid: serverStatus.pid ?? '–', port: serverStatus.port })}
              </span>
            )}
            {serverStatus.state === 'starting' && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-mono">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {t('settings.serverStarting')}
              </span>
            )}
            {serverStatus.state === 'stopped' && (
              <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full font-mono">
                {t('settings.serverStopped')}
              </span>
            )}
            {serverStatus.state === 'failed' && (
              <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-full font-mono">
                {t('settings.serverFailed')}
              </span>
            )}
          </div>
        </div>

        {/* Model File Selection */}
        <div className="space-y-1.5">
          <label htmlFor="settings-model" className="text-xs font-medium text-slate-300">
            {t('settings.modelPath')}
          </label>
          <div className="flex gap-2">
            <select
              id="settings-model"
              value={serverConfig.model_path}
              onChange={(e) => selectLocalModel(e.target.value)}
              className="flex-1 bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-accent-500"
            >
              <option value="">{t('settings.modelPlaceholder')}</option>
              {scannedModels.map((m, idx) => (
                <option key={idx} value={m.path}>
                  {m.name} ({(m.size_mb / 1024).toFixed(1)} GB · {m.runtime === 'prism' ? 'PrismML' : t('settings.runtimeStandard')})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleBrowseModel}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('settings.browseFile')}</span>
            </button>
          </div>
          {(() => {
            const selectedModel = scannedModels.find((m) => m.path === serverConfig.model_path);
            if (!selectedModel) return null;
            return (
              <div className={`text-xs flex items-center gap-1.5 ${selectedModel.runtime === 'prism' ? 'text-cyan-300' : 'text-slate-500'}`}>
                <Check className="w-3 h-3" />
                <span>
                  {t('settings.runtimeInfo', {
                    runtime: selectedModel.runtime === 'prism' ? t('settings.runtimePrism') : t('settings.runtimeLlama'),
                    note: selectedModel.compatibility_note,
                  })}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Core Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Context Size */}
          <div className="space-y-1">
            <label htmlFor="settings-ctx" className="text-slate-300 font-medium">
              {t('settings.contextSize')}
            </label>
            <select
              id="settings-ctx"
              value={serverConfig.context_size}
              onChange={(e) => setServerConfig({ context_size: parseInt(e.target.value) })}
              className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
            >
              {[2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144].map((size) => (
                <option key={size} value={size}>
                  {t(
                    size === 32768
                      ? 'settings.ctx32k'
                      : size === 131072
                        ? 'settings.ctx128k'
                        : size === 262144
                          ? 'settings.ctx256k'
                          : 'settings.tokens',
                    { count: size }
                  )}
                </option>
              ))}
            </select>
          </div>

          {/* GPU Layers */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label htmlFor="settings-ngl" className="text-slate-300 font-medium">
                {t('settings.gpuLayers')}
              </label>
              <span className="font-mono text-cyan-400 font-bold">{serverConfig.gpu_layers}</span>
            </div>
            <input
              id="settings-ngl"
              type="range"
              min="0"
              max="99"
              value={serverConfig.gpu_layers}
              onChange={(e) => setServerConfig({ gpu_layers: parseInt(e.target.value) })}
              className="w-full accent-accent-500"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>{t('settings.gpuLayersCpu')}</span>
              <span>{t('settings.gpuLayersPartial')}</span>
              <span>{t('settings.gpuLayersMax')}</span>
            </div>
          </div>

          {/* Port */}
          <div className="space-y-1">
            <label htmlFor="settings-port" className="text-slate-300 font-medium">
              {t('settings.port')}
            </label>
            <input
              id="settings-port"
              type="number"
              value={serverConfig.port}
              onChange={(e) => setServerConfig({ port: parseInt(e.target.value) || 48596 })}
              className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
            />
          </div>
        </div>

        {/* Advanced Server Tuning Section */}
        <div className="p-3.5 rounded-lg bg-app/40 border border-slate-800/80 space-y-3">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('settings.tuningTitle')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Batch Size */}
            <div className="space-y-1">
              <label htmlFor="settings-batch" className="text-slate-400">
                {t('settings.batchSize')}
              </label>
              <select
                id="settings-batch"
                value={serverConfig.batch_size ?? 2048}
                onChange={(e) => setServerConfig({ batch_size: parseInt(e.target.value) })}
                className="w-full bg-app border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
              >
                <option value={512}>{t('settings.batch512')}</option>
                <option value={1024}>{t('settings.batch1024')}</option>
                <option value={2048}>{t('settings.batch2048')}</option>
                <option value={4096}>{t('settings.batch4096')}</option>
              </select>
            </div>

            {/* UBatch Size */}
            <div className="space-y-1">
              <label htmlFor="settings-ubatch" className="text-slate-400">
                {t('settings.ubatchSize')}
              </label>
              <select
                id="settings-ubatch"
                value={serverConfig.ubatch_size ?? 512}
                onChange={(e) => setServerConfig({ ubatch_size: parseInt(e.target.value) })}
                className="w-full bg-app border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
              >
                <option value={256}>256</option>
                <option value={512}>{t('settings.defaultSuffix', { value: 512 })}</option>
                <option value={1024}>1024</option>
              </select>
            </div>

            {/* KV Cache K Quantization */}
            <div className="space-y-1">
              <label htmlFor="settings-kv" className="text-slate-400">
                {t('settings.kvCache')}
              </label>
              <select
                id="settings-kv"
                value={serverConfig.cache_type_k ?? 'f16'}
                onChange={(e) =>
                  setServerConfig({
                    cache_type_k: e.target.value,
                    cache_type_v: e.target.value,
                  })
                }
                className="w-full bg-app border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
              >
                <option value="f16">{t('settings.kvF16')}</option>
                <option value="q8_0">{t('settings.kvQ8')}</option>
                <option value="q4_0">{t('settings.kvQ4')}</option>
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
                className="rounded border-slate-700 bg-slate-900 text-accent-600 focus:ring-0"
              />
              <span className="text-slate-300">{t('settings.flashAttn')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={serverConfig.mlock ?? false}
                onChange={(e) => setServerConfig({ mlock: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-accent-600 focus:ring-0"
              />
              <span className="text-slate-300">{t('settings.mlock')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={serverConfig.cpu_moe ?? false}
                onChange={(e) => setServerConfig({ cpu_moe: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-accent-600 focus:ring-0"
              />
              <span className="text-slate-300">{t('settings.cpuMoe')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={serverConfig.reasoning_mode ?? false}
                onChange={(e) => setServerConfig({ reasoning_mode: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-accent-600 focus:ring-0"
              />
              <span className="text-slate-300">{t('settings.reasoningMode')}</span>
            </label>
          </div>
        </div>

        {/* Layer Recommendation Box */}
        <div className="p-3 rounded-lg bg-accent-950/20 border border-accent-900/40 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-accent-300 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-accent-400" />
              <span>{t('settings.autoVram')}</span>
            </div>
            <div className="text-xs text-slate-400">
              {layerRecommendation
                ? layerRecommendation.advice
                : t('settings.autoVramIntro')}
            </div>
            {layerRecommendation && (
              <div className="text-[11px] text-slate-500">
                {t('settings.vramBreakdown', {
                  profile: layerRecommendation.profile_name,
                  model: (layerRecommendation.estimated_model_vram_mb / 1024).toFixed(1),
                  kv: (layerRecommendation.estimated_context_vram_mb / 1024).toFixed(1),
                  runtime: (layerRecommendation.runtime_overhead_mb / 1024).toFixed(1),
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRecommendLayers}
              className="px-3 py-1.5 rounded bg-accent-900/40 hover:bg-accent-900/60 text-accent-200 text-xs font-medium border border-accent-700/50 transition-colors"
            >
              {t('settings.calculate')}
            </button>
            {layerRecommendation && (
              <button
                type="button"
                onClick={applyRecommendation}
                className="px-3 py-1.5 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors"
              >
                {t('settings.applyRecommendation', {
                  layers: layerRecommendation.recommended_layers,
                  ctx: Math.round(layerRecommendation.recommended_context_size / 1024),
                })}
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
            title={!serverConfig.model_path ? t('settings.startDisabledHint') : undefined}
            className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/40"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{t('settings.startServer')}</span>
          </button>

          <button
            type="button"
            disabled={serverStatus.state === 'stopped'}
            onClick={stopServer}
            className="py-2.5 px-6 rounded-lg bg-rose-600/80 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>{t('settings.stopServer')}</span>
          </button>
        </div>

        {/* Error Message */}
        {serverStatus.error_message && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('settings.startError')}
            </div>
            <div className="font-mono text-xs whitespace-pre-wrap select-text">{serverStatus.error_message}</div>
          </div>
        )}

        {/* Server Live Logs */}
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-app">
          <button
            onClick={() => setShowLogs(!showLogs)}
            aria-expanded={showLogs}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/80 text-xs font-semibold text-slate-300 hover:bg-slate-800/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-accent-400" />
              <span>{t('settings.serverLog', { count: serverStatus.recent_logs.length })}</span>
            </div>
            <span className="text-[11px] text-slate-500">{showLogs ? t('settings.collapse') : t('settings.expand')}</span>
          </button>

          {showLogs && (
            <div className="p-3 font-mono text-xs text-slate-300 h-44 overflow-y-auto space-y-0.5 bg-app/90 leading-tight select-text">
              {serverStatus.recent_logs.length === 0 ? (
                <div className="text-slate-500 italic">{t('settings.noLogs')}</div>
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
  );
};
