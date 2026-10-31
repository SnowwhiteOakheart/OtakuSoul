import { useEffect, useState } from 'react';
import { useAppStore, type SettingsSection, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Cpu, RefreshCw, Palette, Key, Sliders, Download, FileText, Image as ImageIcon, AudioLines } from 'lucide-react';
import { GeneralSettings } from './sections/GeneralSettings';
import { ServerSettings } from './sections/ServerSettings';
import { ProviderSettings } from './sections/ProviderSettings';
import { SamplerSettings } from './sections/SamplerSettings';
import { PromptSettings } from './sections/PromptSettings';
import { ModelHubSettings } from './sections/ModelHubSettings';
import { ImageSettings } from './sections/ImageSettings';
import { VoiceSettings } from './sections/VoiceSettings';
import { Button, Tabs, type TabItem } from '../ui';

export const SettingsView = () => {
  const { t } = useTranslation();
  const { fetchHardware, initApp, expertMode, setExpertMode } = useStoreFields('fetchHardware', 'initApp', 'expertMode', 'setExpertMode');

  const [activeTab, setActiveTab] = useState<SettingsSection>(
    () => useAppStore.getState().pendingSettingsSection ?? 'general'
  );
  // Jumps while the view is already open (command palette, header status). The section asked
  // for at opening is already shown (state initializer): here it is only marked as done.
  useEffect(() => {
    useAppStore.getState().consumePendingSettingsSection();
    return useAppStore.subscribe((state, previous) => {
      if (!state.pendingSettingsSection || state.pendingSettingsSection === previous.pendingSettingsSection) return;
      const section = useAppStore.getState().consumePendingSettingsSection();
      if (section) setActiveTab(section);
    });
  }, []);
  // The prompt editor is for experts; a jump to it (palette) still shows it.
  const expertOnly: SettingsSection[] = ['prompt'];
  const allTabs: TabItem<SettingsSection>[] = [
    { value: 'general', label: t('settings.appearance'), icon: Palette, panelId: 'settings-panel-general' },
    { value: 'server', label: t('settings.tabServer'), icon: Cpu, panelId: 'settings-panel-server' },
    { value: 'providers', label: t('settings.tabProviders'), icon: Key, panelId: 'settings-panel-providers' },
    { value: 'sampler', label: t('settings.tabSampler'), icon: Sliders, panelId: 'settings-panel-sampler' },
    { value: 'prompt', label: t('settings.tabPrompt'), icon: FileText, panelId: 'settings-panel-prompt' },
    { value: 'image', label: t('settings.tabImage'), icon: ImageIcon, panelId: 'settings-panel-image' },
    { value: 'voice', label: t('settings.tabVoice'), icon: AudioLines, panelId: 'settings-panel-voice' },
    { value: 'hub', label: t('settings.tabHub'), icon: Download, panelId: 'settings-panel-hub' },
  ];
  const settingsTabs = allTabs.filter((tab) => expertMode || !expertOnly.includes(tab.value) || tab.value === activeTab);

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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300" title={t('settings.expertModeHint')}>
              <input
                type="checkbox"
                id="setting-expert-mode"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
                className="accent-accent-500"
              />
              {t('settings.expertMode')}
            </label>
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
        </div>
        {!expertMode && <p className="-mt-3 text-xs text-slate-500">{t('settings.simpleModeHint')}</p>}

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
          {activeTab === 'prompt' && <PromptSettings />}
          {activeTab === 'image' && <ImageSettings />}
          {activeTab === 'voice' && <VoiceSettings />}
          {activeTab === 'hub' && <ModelHubSettings onNavigate={setActiveTab} />}
        </div>
      </div>
    </div>
  );
};
