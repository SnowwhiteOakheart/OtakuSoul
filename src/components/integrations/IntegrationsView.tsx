import React from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Smartphone, Gamepad2, Palette, Database, Layers } from 'lucide-react';
import { WebClientTab } from './tabs/WebClientTab';
import { DiscordTab } from './tabs/DiscordTab';
import { ImageGenTab } from './tabs/ImageGenTab';
import { BackupTab } from './tabs/BackupTab';

export const IntegrationsView: React.FC = () => {
  const { t } = useTranslation();
  const { webServerStatus, discordRpcEnabled, backups, integrationsTab: activeTab, setIntegrationsTab: setActiveTab } = useStoreFields(
    'webServerStatus', 'discordRpcEnabled', 'backups', 'integrationsTab', 'setIntegrationsTab',
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-cyan-600/30 to-indigo-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">{t('int.title')}</h1>
            </div>
            <p className="text-xs text-slate-400">
              {t('int.subtitle')}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label={t('int.tabs')} className="flex items-center p-1 bg-app/80 border border-slate-800 rounded-xl">
          <button
            role="tab"
            aria-selected={activeTab === 'web'}
            onClick={() => setActiveTab('web')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'web'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{t('int.tabWeb')}</span>
            {webServerStatus?.is_running && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'discord'}
            onClick={() => setActiveTab('discord')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'discord'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Discord</span>
            {discordRpcEnabled && (
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            )}
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'image'}
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'image'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{t('int.tabImage')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'backup'}
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'backup'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{t('int.tabBackup')}</span>
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 font-mono">
              {backups.length}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
        {activeTab === 'web' && <WebClientTab />}
        {activeTab === 'discord' && <DiscordTab />}
        {activeTab === 'image' && <ImageGenTab />}
        {activeTab === 'backup' && <BackupTab />}
      </div>
    </div>
  );
};
