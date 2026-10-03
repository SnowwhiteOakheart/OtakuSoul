import { useState, useEffect } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Cpu,
  Key,
  RefreshCw,
  Search,
  Sparkles,
  Layers,
  Check,
} from 'lucide-react';
import type { LlmProviderType } from '../../../types';

export const ProviderSettings = () => {
  const { t } = useTranslation();
  const {
    selectedBackend, setSelectedBackend, cloudProvider, setCloudProvider, cloudEndpoint,
    setCloudEndpoint, cloudApiKey, setCloudApiKey, cloudModel, setCloudModel, cloudContextTokens, setCloudContextTokens, openRouterModels,
    isLoadingOpenRouterModels, fetchOpenRouterModels,
  } = useStoreFields(
    'selectedBackend', 'setSelectedBackend', 'cloudProvider', 'setCloudProvider', 'cloudEndpoint',
    'setCloudEndpoint', 'cloudApiKey', 'setCloudApiKey', 'cloudModel', 'setCloudModel', 'cloudContextTokens', 'setCloudContextTokens',
    'openRouterModels', 'isLoadingOpenRouterModels', 'fetchOpenRouterModels',
  );

  // OpenRouter search filter
  const [openRouterSearch, setOpenRouterSearch] = useState('');

  useEffect(() => {
    if (openRouterModels.length === 0 && cloudProvider === 'open_router' && cloudApiKey) {
      fetchOpenRouterModels(cloudApiKey);
    }
  }, [cloudApiKey, cloudProvider, fetchOpenRouterModels, openRouterModels.length]);

  const filteredOpenRouterModels = openRouterModels.filter(
    (m) =>
      m.id.toLowerCase().includes(openRouterSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(openRouterSearch.toLowerCase())
  );

  return (
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
            <p id="settings-apikey-hint" className="text-xs text-slate-400">
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

          <div className="space-y-1.5">
            <label htmlFor="settings-cloud-context" className="text-slate-300 font-medium">
              {t('settings.cloudContext')}
            </label>
            <input
              id="settings-cloud-context"
              type="number"
              min={2048}
              step={1024}
              value={cloudContextTokens}
              onChange={(e) => setCloudContextTokens(Math.max(2048, parseInt(e.target.value) || 32768))}
              className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-hidden focus:border-accent-500"
            />
            <p className="text-xs text-slate-400">{t('settings.cloudContextHint')}</p>
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
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
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
                        <div className="font-mono text-[11px] text-slate-400">{m.id}</div>
                      </div>

                      <div className="text-right font-mono text-xs text-slate-400">
                        {m.context_length != null && (
                          <span>{t('settings.orContext', { size: (m.context_length / 1024).toFixed(0) })}</span>
                        )}
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
  );
};
