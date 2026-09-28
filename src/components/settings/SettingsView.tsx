import { useState } from 'react';
import { useAppStore, type SettingsSection, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Cpu, RefreshCw, Palette, Key, Sliders, Download } from 'lucide-react';
import { GeneralSettings } from './sections/GeneralSettings';
import { ServerSettings } from './sections/ServerSettings';
import { ProviderSettings } from './sections/ProviderSettings';
import { SamplerSettings } from './sections/SamplerSettings';
import { ModelHubSettings } from './sections/ModelHubSettings';
import { Button, Tabs, type TabItem } from '../ui';

export const SettingsView = () => {
  const { t } = useTranslation();
  const { fetchHardware, initApp } = useStoreFields('fetchHardware', 'initApp');

  const [activeTab, setActiveTab] = useState<SettingsSection>(
    () => useAppStore.getState().consumePendingSettingsSection() ?? 'general'
  );
  const settingsTabs: TabItem<SettingsSection>[] = [
    { value: 'general', label: t('settings.appearance'), icon: Palette, panelId: 'settings-panel-general' },
    { value: 'server', label: t('settings.tabServer'), icon: Cpu, panelId: 'settings-panel-server' },
    { value: 'providers', label: t('settings.tabProviders'), icon: Key, panelId: 'settings-panel-providers' },
    { value: 'sampler', label: t('settings.tabSampler'), icon: Sliders, panelId: 'settings-panel-sampler' },
    { value: 'hub', label: t('settings.tabHub'), icon: Download, panelId: 'settings-panel-hub' },
  ];

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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              fetchHardware();
              initApp();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('settings.refresh')}</span>
          </Button>
        </div>

        <Tabs
          idPrefix="settings"
          ariaLabel={t('settings.tabs')}
          items={settingsTabs}
          value={activeTab}
          onValueChange={setActiveTab}
        />

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'server' && <ServerSettings />}
          {activeTab === 'providers' && <ProviderSettings />}
          {activeTab === 'sampler' && <SamplerSettings />}
          {activeTab === 'hub' && <ModelHubSettings onNavigate={setActiveTab} />}
        </div>
      </div>
    </div>
  );
};
