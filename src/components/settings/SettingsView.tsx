import { useState, useEffect } from 'react';
import { useAppStore, type SettingsSection, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Cpu, RefreshCw, Palette, Key, Sliders, Download } from 'lucide-react';
import { GeneralSettings } from './sections/GeneralSettings';
import { ServerSettings } from './sections/ServerSettings';
import { ProviderSettings } from './sections/ProviderSettings';
import { SamplerSettings } from './sections/SamplerSettings';
import { ModelHubSettings } from './sections/ModelHubSettings';

export const SettingsView = () => {
  const { t } = useTranslation();
  const { fetchHardware, initApp } = useStoreFields('fetchHardware', 'initApp');

  const [activeTab, setActiveTab] = useState<SettingsSection>(
    () => useAppStore.getState().pendingSettingsSection ?? 'general'
  );
  // Other views (e.g. the first-run wizard) can ask for a specific section while this view is open.
  const pendingSection = useAppStore((state) => state.pendingSettingsSection);
  useEffect(() => {
    const section = useAppStore.getState().consumePendingSettingsSection();
    if (section) setActiveTab(section);
  }, [pendingSection]);

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

        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'server' && <ServerSettings />}
        {activeTab === 'providers' && <ProviderSettings />}
        {activeTab === 'sampler' && <SamplerSettings />}
        {activeTab === 'hub' && <ModelHubSettings onNavigate={setActiveTab} />}
      </div>
    </div>
  );
};
