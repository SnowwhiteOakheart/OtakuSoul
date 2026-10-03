import { useState, useEffect } from 'react';
import { useStoreFields, type SettingsSection } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  Sparkles,
  Check,
} from 'lucide-react';
import { backendMessage } from '../../../utils/errors';

export const ModelHubSettings = ({ onNavigate }: { onNavigate: (section: SettingsSection) => void }) => {
  const { t } = useTranslation();
  const {
    hardware, serverConfig, selectLocalModel, hfSearchResults, isSearchingHf, hfError,
    searchHfModels, hfModelFiles, isLoadingHfFiles, fetchHfModelFiles, downloadProgress,
    downloadGgufModel, scannedModels,
  } = useStoreFields(
    'hardware', 'serverConfig', 'selectLocalModel', 'hfSearchResults', 'isSearchingHf', 'hfError',
    'searchHfModels', 'hfModelFiles', 'isLoadingHfFiles', 'fetchHfModelFiles', 'downloadProgress',
    'downloadGgufModel', 'scannedModels',
  );

  // HuggingFace search
  const BONSAI_MODEL_ID = 'prism-ml/Ternary-Bonsai-27B-gguf';
  const [hfQuery, setHfQuery] = useState('Ternary-Bonsai-27B-gguf');
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [hubView, setHubView] = useState<'recommended' | 'installed' | 'popular' | 'search'>('recommended');
  const gpu = hardware?.gpus[0];

  useEffect(() => {
    if (
      hubView === 'recommended' &&
      !hfModelFiles[BONSAI_MODEL_ID] &&
      !isLoadingHfFiles[BONSAI_MODEL_ID]
    ) {
      fetchHfModelFiles(BONSAI_MODEL_ID);
    }
  }, [fetchHfModelFiles, hfModelFiles, hubView, isLoadingHfFiles]);

  const showBonsaiRecommendation = () => {
    setHubView('recommended');
    setExpandedModelId(BONSAI_MODEL_ID);
    if (!hfModelFiles[BONSAI_MODEL_ID]) {
      fetchHfModelFiles(BONSAI_MODEL_ID);
    }
  };

  return (
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
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
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
                  <div className="text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {installed ? (
                <button
                  onClick={() => {
                    selectLocalModel(installed.path);
                    onNavigate('server');
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
                >
                  <Check className="w-4 h-4" /> {t('settings.installedSelect')}
                </button>
              ) : recommendedFile ? (
                <button
                  onClick={() => downloadGgufModel(recommendedFile)}
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
                onNavigate('server');
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

                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
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
                      <span className="text-[11px] text-slate-400">{t('settings.by', { author: model.author })}</span>
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
                      <div className="py-2 text-center text-xs text-slate-400">
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
                                <span className={file.runtime === 'prism' ? 'text-cyan-300' : file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-400'}>
                                  {file.runtime === 'prism'
                                    ? t('settings.runtimePrismLabel')
                                    : file.runtime === 'legacy'
                                      ? t('settings.runtimeLegacy')
                                      : t('settings.runtimeStandardLabel')}
                                </span>
                              </div>
                              <div className={`text-[11px] ${file.runtime === 'legacy' ? 'text-rose-300' : 'text-slate-400'}`}>{backendMessage(file.compatibility_note)}</div>
                            </div>

                            <button
                              onClick={() => downloadGgufModel(file)}
                              disabled={file.runtime === 'legacy'}
                              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0"
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
  );
};
