import { useState, useEffect } from 'react';
import { useAppStore, type SettingsSection, useStoreFields } from '../../store/useAppStore';
import { translate, useTranslation, SupportedLanguage } from '../../i18n';
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
  Palette,
  Globe,
} from 'lucide-react';
import { LlmProviderType, LlmPreset } from '../../types';
import { api } from '../../services/api';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import { APP_THEMES } from './themes';

export const SettingsView = () => {
  const { t } = useTranslation();
  const appPaths = useAppStore((s) => s.appPaths);
  const {
    theme,
    setTheme,
    appLanguage,
    setAppLanguage,
    setIsLogViewerOpen,
    setIsUpdaterOpen,
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
  } = useStoreFields(
    'theme', 'setTheme', 'appLanguage', 'setAppLanguage', 'setIsLogViewerOpen', 'setIsUpdaterOpen',
    'hardware', 'fetchHardware', 'layerRecommendation', 'fetchLayerRecommendation', 'serverStatus',
    'serverConfig', 'setServerConfig', 'selectLocalModel', 'startServer', 'stopServer',
    'selectedBackend', 'setSelectedBackend', 'cloudProvider', 'setCloudProvider', 'cloudEndpoint',
    'setCloudEndpoint', 'cloudApiKey', 'setCloudApiKey', 'cloudModel', 'setCloudModel',
    'openRouterModels', 'isLoadingOpenRouterModels', 'fetchOpenRouterModels', 'llmPresets',
    'activePresetId', 'applyLlmPreset', 'saveLlmPreset', 'deleteLlmPreset', 'hfSearchResults',
    'isSearchingHf', 'hfError', 'searchHfModels', 'hfModelFiles', 'isLoadingHfFiles',
    'fetchHfModelFiles', 'downloadProgress', 'downloadGgufModel', 'scannedModels', 'scannedVrms',
    'activeVrmPath', 'setActiveVrmPath', 'scannedLive2ds', 'activeLive2dPath',
    'setActiveLive2dPath', 'refreshLive2dModels', 'sampling', 'setSampling', 'replyLanguage',
    'setReplyLanguage', 'lorebookScanDepth', 'setLorebookScanDepth', 'initApp',
  );

  const [activeTab, setActiveTab] = useState<SettingsSection>(
    () => useAppStore.getState().pendingSettingsSection ?? 'general'
  );
  // Other views (e.g. the first-run wizard) can ask for a specific section while this view is open.
  const pendingSection = useAppStore((state) => state.pendingSettingsSection);
  useEffect(() => {
    const section = useAppStore.getState().consumePendingSettingsSection();
    if (section) setActiveTab(section);
  }, [pendingSection]);
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
            name: translate('settings.fileFilterVrm'),
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

  const handleBrowseLive2d = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: translate('settings.fileFilterLive2d'),
            extensions: ['zip', 'json'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const imported = await api.importLive2dModel(selected);
        await refreshLive2dModels();
        setActiveLive2dPath(imported.model_path);
        toast.success(translate('settings.live2dImported', { name: imported.name }));
      }
    } catch (e) {
      console.error('Failed to import Live2D model:', e);
      toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    }
  };

  const handleImportSowLive2d = async () => {
    setIsImportingSow(true);
    try {
      const count = await api.importSowLive2dModels();
      await refreshLive2dModels();
      toast.success(translate('settings.sowLive2dImported', { count }));
    } catch (e) {
      console.error('Failed to import SoW Live2D models:', e);
      toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
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
      description: newPresetDesc.trim() || translate('settings.customPresetDesc'),
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
    <div className="flex-1 overflow-y-auto p-6 bg-app space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-accent-400" />
              {t('settings.title')}
            </h1>
            <p className="text-xs text-slate-400 mt-1">{t('settings.subtitle')}</p>
          </div>
          <button
            onClick={() => {
              fetchHardware();
              initApp();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('settings.refresh')}</span>
          </button>
        </div>

        {/* Sub-Tabs Navigation */}
        <div role="tablist" aria-label={t('settings.tabs')} className="flex border-b border-slate-800 gap-2 overflow-x-auto">
          <button
            role="tab"
            aria-selected={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'general'
                ? 'border-accent-500 text-accent-400 bg-accent-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>{t('settings.appearance')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'server'}
            onClick={() => setActiveTab('server')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'server'
                ? 'border-accent-500 text-accent-400 bg-accent-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>{t('settings.tabServer')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'providers'}
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'providers'
                ? 'border-accent-500 text-accent-400 bg-accent-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{t('settings.tabProviders')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'sampler'}
            onClick={() => setActiveTab('sampler')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'sampler'
                ? 'border-accent-500 text-accent-400 bg-accent-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{t('settings.tabSampler')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'hub'}
            onClick={() => setActiveTab('hub')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'hub'
                ? 'border-accent-500 text-accent-400 bg-accent-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.tabHub')}</span>
          </button>
        </div>

        {/* TAB 0: ALLGEMEIN & THEMES */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* 1. Theme-Auswahl */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-accent-400" />
                  {t('settings.theme')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{t('settings.themeIntro')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {APP_THEMES.map((th) => {
                  const isSelected = (theme || 'obsidian') === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setTheme(th.id)}
                      aria-pressed={isSelected}
                      className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-accent-500/80 bg-accent-950/20 shadow-lg shadow-accent-950/30'
                          : 'border-slate-800 bg-app/60 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-xs text-slate-200">{th.name}</span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 mt-1 mb-3">{t(`settings.theme.${th.id}`)}</span>
                      
                      {/* Farbmuster */}
                      <div className="flex items-center gap-1.5 mt-auto">
                        <div
                          className="w-5 h-5 rounded-full border border-white/10"
                          style={{ backgroundColor: th.bg }}
                          title={t('settings.swatchBg')}
                        />
                        <div
                          className="w-5 h-5 rounded-full border border-white/10"
                          style={{ backgroundColor: th.primary }}
                          title={t('settings.swatchPrimary')}
                        />
                        <div
                          className="w-5 h-5 rounded-full border border-white/10"
                          style={{ backgroundColor: th.accent }}
                          title={t('settings.swatchAccent')}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Sprachauswahl UI */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  {t('settings.language')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{t('settings.languageIntro')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'de', label: 'Deutsch', sub: t('settings.langDeSub') },
                  { id: 'en', label: 'English', sub: t('settings.langEnSub') },
                  { id: 'ru', label: 'Русский', sub: t('settings.langRuSub') },
                ].map((l) => {
                  const isSelected = (appLanguage || 'de') === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setAppLanguage(l.id as SupportedLanguage)}
                      aria-pressed={isSelected}
                      lang={l.id}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-cyan-500/80 bg-cyan-950/20 text-cyan-300 shadow-sm'
                          : 'border-slate-800 bg-app/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-xs text-slate-200">{l.label}</div>
                        <div className="text-[11px] text-slate-400">{l.sub}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Antwort-Sprache (Roleplay default reply language) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  {t('settings.replyLanguage')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{t('settings.replyLanguageIntro')}</p>
              </div>

              <div className="max-w-xs">
                {/* The value is written verbatim into the system prompt ("Antworte auf **Deutsch**"), so store language names, not codes. */}
                <select
                  aria-label={t('settings.replyLanguage')}
                  value={replyLanguage || 'Deutsch'}
                  onChange={(e) => setReplyLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-app border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                >
                  <option value="Deutsch">Deutsch</option>
                  <option value="English">English</option>
                  <option value="Русский">Русский</option>
                  <option value="日本語">日本語</option>
                  <option value="Français">Français</option>
                  <option value="Español">Español</option>
                </select>
              </div>
            </div>

            {/* 4. System-Diagnose & Updates */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  {t('settings.systemTitle')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{t('settings.systemIntro')}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsLogViewerOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700/60"
                >
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>{t('settings.openLogs')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsUpdaterOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent-600/20 hover:bg-accent-600/30 text-accent-300 text-xs font-medium transition-colors border border-accent-500/40"
                >
                  <Sparkles className="w-4 h-4 text-accent-400" />
                  <span>{t('header.update')}</span>
                </button>
              </div>

              <div className="p-3 rounded-lg bg-app/80 border border-slate-800/80 text-xs text-slate-400 font-mono space-y-1">
                <div>
                  {t('settings.version')}: <span className="text-accent-300 font-semibold">{t('header.version')}</span>
                </div>
                <div className="select-text break-all">
                  {t('settings.dataDir')}: <span className="text-slate-300">{appPaths?.data_dir ?? '…'}</span>
                </div>
                <div className="select-text break-all">
                  {t('settings.configDir')}: <span className="text-slate-300">{appPaths?.config_dir ?? '…'}</span>
                </div>
              </div>
            </div>
            {/* 4. Standard-Avatare (VRM & Live2D) */}
            <h2 className="text-sm font-semibold text-slate-200 pt-2">{t('settings.avatarDefaults')}</h2>
            {/* 3D Avatar (VRM) Standard-Auswahl */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-accent2-400" />
                <span>{t('settings.vrmDefault')}</span>
              </h3>
              <div className="flex gap-2 text-xs">
                <select
                  aria-label={t('settings.vrmDefault')}
                  value={activeVrmPath || ''}
                  onChange={(e) => setActiveVrmPath(e.target.value || null)}
                  className="flex-1 bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
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
                  <span className="whitespace-nowrap">{t('settings.chooseVrm')}</span>
                </button>
              </div>
            </div>

            {/* 2D Live2D Standard-Auswahl & Import */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-accent-400" />
                  <span>{t('settings.live2dDefault')}</span>
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <select
                  aria-label={t('settings.live2dDefault')}
                  value={activeLive2dPath || ''}
                  onChange={(e) => setActiveLive2dPath(e.target.value || null)}
                  className="flex-1 min-w-[200px] bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
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
                  title={t('settings.importLive2dHint')}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-accent-400" />
                  <span className="whitespace-nowrap">{t('settings.importLive2d')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleImportSowLive2d}
                  disabled={isImportingSow}
                  className="px-3.5 py-2 rounded-lg bg-accent-950/60 hover:bg-accent-900/80 text-accent-200 font-medium flex items-center gap-1.5 transition-colors border border-accent-700/60 disabled:opacity-50"
                  title={t('settings.importSowLive2dHint')}
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent2-400" />
                  <span className="whitespace-nowrap">{isImportingSow ? t('settings.importing') : t('settings.importSowLive2d')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: SERVER & HARDWARE TUNING */}
        {activeTab === 'server' && (
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
        )}

        {/* TAB 2: CLOUD PROVIDERS & OPENROUTER SEARCH */}
        {activeTab === 'providers' && (
          <div className="space-y-6">
            {/* Backend Switch */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent-400" />
                {t('settings.backendTitle')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  onClick={() => setSelectedBackend('local')}
                  aria-pressed={selectedBackend === 'local'}
                  className={`p-3 rounded-lg border text-left transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    selectedBackend === 'local'
                      ? 'border-accent-500 bg-accent-500/10 text-accent-200'
                      : 'border-slate-800 bg-app/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{t('settings.backendLocal')}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{t('settings.backendLocalHint')}</div>
                </button>

                <button
                  onClick={() => setSelectedBackend('cloud')}
                  aria-pressed={selectedBackend === 'cloud'}
                  className={`p-3 rounded-lg border text-left transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    selectedBackend === 'cloud'
                      ? 'border-accent-500 bg-accent-500/10 text-accent-200'
                      : 'border-slate-800 bg-app/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('settings.backendCloud')}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{t('settings.backendCloudHint')}</div>
                </button>
              </div>
            </div>

            {/* Provider Configuration */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                {t('settings.providerTitle')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Provider Type */}
                <div className="space-y-1.5">
                  <label htmlFor="settings-provider" className="text-slate-300 font-medium">
                    {t('settings.providerProtocol')}
                  </label>
                  <select
                    id="settings-provider"
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value as LlmProviderType)}
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
                  >
                    <option value="open_router">{t('settings.providerOpenRouter')}</option>
                    <option value="anthropic">{t('settings.providerAnthropic')}</option>
                    <option value="open_ai">{t('settings.providerOpenAi')}</option>
                    <option value="deep_seek">{t('settings.providerDeepSeek')}</option>
                    <option value="gemini">{t('settings.providerGemini')}</option>
                    <option value="mistral">{t('settings.providerMistral')}</option>
                    <option value="custom">{t('settings.providerCustom')}</option>
                  </select>
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label htmlFor="settings-apikey" className="text-slate-300 font-medium">
                    {t('settings.apiKey')}
                  </label>
                  <input
                    id="settings-apikey"
                    type="password"
                    autoComplete="off"
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                    placeholder={t('settings.apiKeyPlaceholder')}
                    aria-describedby="settings-apikey-hint"
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
                  />
                  <p id="settings-apikey-hint" className="text-xs text-slate-500">
                    {t('settings.apiKeyHint')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <label htmlFor="settings-endpoint" className="text-slate-300 font-medium">
                    {t('settings.endpoint')}
                  </label>
                  <input
                    id="settings-endpoint"
                    type="text"
                    value={cloudEndpoint}
                    onChange={(e) => setCloudEndpoint(e.target.value)}
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
                  />
                </div>

                {/* Model Identifier */}
                <div className="space-y-1.5">
                  <label htmlFor="settings-modelid" className="text-slate-300 font-medium">
                    {t('settings.modelId')}
                  </label>
                  <input
                    id="settings-modelid"
                    type="text"
                    value={cloudModel}
                    onChange={(e) => setCloudModel(e.target.value)}
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
                  />
                </div>
              </div>

              {/* OpenRouter Model Catalog Integration */}
              {cloudProvider === 'open_router' && (
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-accent-400" />
                        <span>{t('settings.orCatalog')}</span>
                      </h3>
                      <p className="text-xs text-slate-400">{t('settings.orCatalogIntro')}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isLoadingOpenRouterModels}
                      onClick={() => fetchOpenRouterModels()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOpenRouterModels ? 'animate-spin' : ''}`} />
                      <span>{openRouterModels.length > 0 ? t('settings.refresh') : t('settings.orLoad')}</span>
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
                          placeholder={t('settings.orSearch')}
                          aria-label={t('settings.orSearch')}
                          className="w-full bg-app border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                        />
                      </div>

                      <div className="h-48 overflow-y-auto rounded-lg border border-slate-800 bg-app divide-y divide-slate-800/60 text-xs">
                        {filteredOpenRouterModels.slice(0, 50).map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            aria-label={m.name}
                            onClick={() => setCloudModel(m.id)}
                            aria-pressed={cloudModel === m.id}
                            className={`w-full text-left p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors outline-hidden focus-visible:bg-slate-900 ${
                              cloudModel === m.id ? 'bg-accent-950/40 text-accent-300' : 'text-slate-300'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold flex items-center gap-1.5">
                                <span>{m.name}</span>
                                {cloudModel === m.id && <Check className="w-3.5 h-3.5 text-accent-400" />}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">{m.id}</div>
                            </div>

                            <div className="text-right font-mono text-xs text-slate-400">
                              <span>{t('settings.orContext', { size: (m.context_length / 1024).toFixed(0) })}</span>
                            </div>
                          </button>
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
                    <Sliders className="w-4 h-4 text-accent-400" />
                    {t('settings.presetsTitle')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{t('settings.presetsIntro')}</p>
                </div>

                <button
                  onClick={() => setIsCreatingPreset(true)}
                  className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{t('settings.saveAsPreset')}</span>
                </button>
              </div>

              {/* Preset Selector Badges */}
              <div role="group" aria-label={t('settings.presetList')} className="flex flex-wrap gap-2 pt-1">
                {llmPresets.map((p) => {
                  const isActive = activePresetId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                        isActive
                          ? 'border-accent-500 bg-accent-500/20 text-accent-200'
                          : 'border-slate-800 bg-app/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applyLlmPreset(p.id)}
                        aria-pressed={isActive}
                        title={p.description}
                        aria-label={t('settings.applyPreset', { name: p.name })}
                        className="font-medium rounded outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                      >
                        {p.name}
                      </button>
                      {!p.is_builtin && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmed = await confirmDialog({
                              title: translate('confirm.deletePresetTitle', { name: p.name }),
                              message: translate('confirm.cannotUndo'),
                              confirmLabel: translate('common.delete'),
                              tone: 'danger',
                            });
                            if (confirmed) deleteLlmPreset(p.id);
                          }}
                          title={t('settings.deletePreset', { name: p.name })}
                          aria-label={t('settings.deletePreset', { name: p.name })}
                          className="hover:text-rose-400 ml-1 rounded outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
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
                <div className="p-3 rounded-lg border border-accent-800/60 bg-accent-950/30 space-y-2 text-xs">
                  <div className="font-semibold text-accent-200">{t('settings.newPreset')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={t('settings.presetName')}
                      aria-label={t('settings.presetName')}
                      autoFocus
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      className="bg-app border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                    <input
                      type="text"
                      placeholder={t('settings.presetDesc')}
                      aria-label={t('settings.presetDesc')}
                      value={newPresetDesc}
                      onChange={(e) => setNewPresetDesc(e.target.value)}
                      className="bg-app border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsCreatingPreset(false)}
                      className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSaveCustomPreset}
                      disabled={!newPresetName.trim()}
                      className="px-3 py-1 rounded bg-accent-600 text-white font-medium disabled:opacity-50"
                    >
                      {t('settings.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Standard Samplers */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('settings.classicSampling')}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Temperature */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Temperature:</span>
                    <span className="font-mono text-accent-300 font-bold">{sampling.temperature ?? 0.7}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={sampling.temperature ?? 0.7}
                    onChange={(e) => setSampling({ temperature: parseFloat(e.target.value) })}
                    className="w-full accent-accent-500"
                  />
                  <div className="text-[11px] text-slate-400">{t('settings.temperatureHint')}</div>
                </div>

                {/* Min-P */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-400">{t('settings.minPHint')}</div>
                </div>

                {/* Top-P */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-400">{t('settings.topPHint')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Max Tokens */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">{t('settings.maxTokens')}</span>
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
                  <div className="text-[11px] text-slate-400">{t('settings.maxTokensHint')}</div>
                </div>

                {/* Repeat Penalty */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-400">{t('settings.repeatPenaltyHint')}</div>
                </div>

                {/* Top-K */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-400">{t('settings.topKHint')}</div>
                </div>
              </div>
            </div>

            {/* Advanced Samplers: DRY & XTC & Dynatemp */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>{t('settings.advancedSamplers')}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* DRY (Don't Repeat Yourself) Multiplier */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-500">
                    {t('settings.dryHint')}
                  </div>
                </div>

                {/* XTC (Exclude Top Choices) Threshold */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
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
                  <div className="text-[11px] text-slate-500">
                    {t('settings.xtcHint')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Dynatemp Range */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">Dynamic Temperature Range:</span>
                    <span className="font-mono text-accent-300 font-bold">{sampling.dynatemp_range ?? 0.0}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.8"
                    step="0.05"
                    value={sampling.dynatemp_range ?? 0.0}
                    onChange={(e) => setSampling({ dynatemp_range: parseFloat(e.target.value) })}
                    className="w-full accent-accent-500"
                  />
                  <div className="text-[11px] text-slate-500">
                    {t('settings.dynatempHint')}
                  </div>
                </div>

                {/* Reply Language & Lorebook Depth */}
                <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="settings-lore-depth" className="text-slate-300 font-medium">
                      {t('settings.lorebookDepth')}
                    </label>
                    <input
                      id="settings-lore-depth"
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
                  {t('settings.hubTitle')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{t('settings.hubIntro')}</p>
              </div>

              <div role="group" aria-label={t('settings.hubViews')} className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={showBonsaiRecommendation}
                  aria-pressed={hubView === 'recommended'}
                  className={`px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${hubView === 'recommended' ? 'border-accent-500 bg-accent-500/15 text-accent-200' : 'border-slate-700 bg-app text-slate-400 hover:text-slate-200'}`}
                >
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  {t('settings.hubRecommended')}
                </button>
                <button
                  onClick={() => setHubView('installed')}
                  aria-pressed={hubView === 'installed'}
                  className={`px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${hubView === 'installed' ? 'border-accent-500 bg-accent-500/15 text-accent-200' : 'border-slate-700 bg-app text-slate-400 hover:text-slate-200'}`}
                >
                  {t('settings.hubInstalled', { count: scannedModels.length })}
                </button>
                <button
                  onClick={() => {
                    setHubView('popular');
                    searchHfModels('');
                  }}
                  aria-pressed={hubView === 'popular'}
                  className={`px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${hubView === 'popular' ? 'border-accent-500 bg-accent-500/15 text-accent-200' : 'border-slate-700 bg-app text-slate-400 hover:text-slate-200'}`}
                >
                  {t('settings.hubPopular')}
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
                    placeholder={t('settings.hubSearchPlaceholder')}
                    aria-label={t('settings.hubSearch')}
                    className="w-full bg-app border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
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
                  <span className="whitespace-nowrap">{isSearchingHf ? t('settings.hubSearching') : t('settings.hubSearch')}</span>
                </button>
              </div>
            </div>

            {hfError && (
              <div role="alert" className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="select-text">{hfError}</span>
              </div>
            )}

            {hubView === 'recommended' && (() => {
              const files = hfModelFiles[BONSAI_MODEL_ID] || [];
              const recommendedFile = files.find((file) => file.recommended);
              const installed = scannedModels.find((model) => model.name.toLowerCase().includes('ternary-bonsai-27b-pq2_0'));
              const vramGb = (gpu?.total_vram_mb || 0) / 1024;
              return (
                <div className="rounded-2xl border border-accent-500/50 bg-linear-to-br from-accent-950/60 via-slate-900/80 to-cyan-950/40 p-5 space-y-4 shadow-xl shadow-accent-950/20">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30 uppercase">{t('settings.bonsaiFirstChoice')}</span>
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">PRISM PQ2_0</span>
                        <span className="text-[11px] text-slate-400">Apache-2.0</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-100">Ternary Bonsai 27B</h3>
                      <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                        {t('settings.bonsaiText')}
                      </p>
                    </div>
                    <div className="text-xs md:text-right space-y-1">
                      <div className="text-emerald-300 font-semibold">
                        {vramGb >= 10 ? t('settings.bonsaiFits', { vram: vramGb.toFixed(0) }) : t('settings.bonsaiOffload')}
                      </div>
                      <div className="text-slate-400">{t('settings.bonsaiPeak')}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {[
                      ['27B', t('settings.statParams')],
                      ['~7,2 GB', t('settings.statDownload')],
                      ['32K', t('settings.statStartCtx')],
                      ['262K', t('settings.statMax')],
                    ].map(([value, label]) => (
                      <div key={label} className="rounded-lg bg-app/60 border border-slate-700/70 p-2 text-center">
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
                        <Check className="w-4 h-4" /> {t('settings.installedSelect')}
                      </button>
                    ) : recommendedFile ? (
                      <button
                        onClick={() => downloadGgufModel(recommendedFile.download_url, recommendedFile.filename)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> {t('settings.downloadRecommended')}
                      </button>
                    ) : (
                      <button
                        onClick={showBonsaiRecommendation}
                        disabled={isLoadingHfFiles[BONSAI_MODEL_ID]}
                        className="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingHfFiles[BONSAI_MODEL_ID] ? 'animate-spin' : ''}`} />
                        {isLoadingHfFiles[BONSAI_MODEL_ID] ? t('settings.loadingModelData') : t('settings.prepareDownload')}
                      </button>
                    )}
                    <button type="button" onClick={() => openUrl('https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf')} className="px-3 py-2 text-xs text-cyan-300 hover:text-cyan-200">
                      {t('settings.openModelPage')}
                    </button>
                  </div>

                  {files.length > 0 && !installed && (
                    <div className="pt-3 border-t border-accent-500/20 text-xs text-slate-400">
                      {t('settings.bonsaiSelected', { file: recommendedFile?.filename || t('settings.bonsaiSearching') })}
                    </div>
                  )}
                </div>
              );
            })()}

            {hubView === 'installed' && scannedModels.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">{t('settings.noInstalledModels')}</div>
            )}
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
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      <span className={`px-2 py-0.5 rounded ${model.runtime === 'prism' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-accent-500/15 text-accent-300'}`}>
                        {model.runtime === 'prism' ? 'PrismML' : 'llama.cpp'}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{t('settings.clickToSelect')}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Active Downloads Section */}
            {Object.keys(downloadProgress).length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('settings.downloads')}</span>
                </h3>

                <div className="space-y-2">
                  {Object.values(downloadProgress).map((prog) => (
                    <div key={prog.filename} className="p-3 rounded-lg bg-app border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200 truncate max-w-md">{prog.filename}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400">{prog.speed_mbps.toFixed(1)} MB/s</span>
                          {prog.finished ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                              {t('settings.downloadDone')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[11px] font-bold">
                              {prog.percent.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        role="progressbar"
                        aria-label={t('settings.downloadProgress', { file: prog.filename })}
                        aria-valuenow={Math.round(prog.percent)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden"
                      >
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            prog.finished ? 'bg-emerald-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                        <span>
                          {(prog.downloaded_bytes / (1024 * 1024)).toFixed(1)} MB / {(prog.total_bytes / (1024 * 1024)).toFixed(1)} MB
                        </span>
                        {prog.eta_seconds && prog.eta_seconds > 0 && <span>{t('settings.eta', { seconds: prog.eta_seconds })}</span>}
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
                <div className="text-center py-12 text-slate-400 text-sm">{t('settings.hubEmpty')}</div>
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
                            <span className="text-[11px] text-slate-500">{t('settings.by', { author: model.author })}</span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-3">
                            <span>{t('settings.hfDownloads', { count: model.downloads.toLocaleString() })}</span>
                            <span>{t('settings.hfLikes', { count: model.likes.toLocaleString() })}</span>
                            {model.last_modified && (
                              <span>{t('settings.hfUpdated', { date: model.last_modified.slice(0, 10) })}</span>
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
                          aria-expanded={isExpanded}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <span>{isExpanded ? t('settings.hideFiles') : t('settings.showFiles')}</span>
                        </button>
                      </div>

                      {/* Expanded Files */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          {isLoadingFiles ? (
                            <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>{t('settings.loadingFiles')}</span>
                            </div>
                          ) : files.length === 0 ? (
                            <div className="py-2 text-center text-xs text-slate-500">
                              {t('settings.noGgufFiles')}
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-app overflow-hidden">
                              {files.map((file) => (
                                <div key={file.filename} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-900/50">
                                  <div className="space-y-1 min-w-0 flex-1 pr-3">
                                    <div className="font-semibold text-slate-200 break-all flex items-center gap-2">
                                      <span>{file.filename}</span>
                                      {file.recommended && <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] uppercase">{t('settings.recommended')}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] font-mono">
                                      <span className="px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-300 font-bold">
                                        {file.quantization}
                                      </span>
                                      <span className="text-slate-400">{file.size_formatted}</span>
                                      <span className={file.runtime === 'prism' ? 'text-cyan-300' : file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-500'}>
                                        {file.runtime === 'prism'
                                          ? t('settings.runtimePrismLabel')
                                          : file.runtime === 'legacy'
                                            ? t('settings.runtimeLegacy')
                                            : t('settings.runtimeStandardLabel')}
                                      </span>
                                    </div>
                                    <div className={`text-[11px] ${file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-500'}`}>{file.compatibility_note}</div>
                                  </div>

                                  <button
                                    onClick={() => downloadGgufModel(file.download_url, file.filename)}
                                    disabled={file.runtime === 'legacy'}
                                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span className="whitespace-nowrap">{file.runtime === 'legacy' ? t('settings.doNotUse') : t('settings.downloadSelect')}</span>
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
