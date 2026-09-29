import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { LOCALES, useTranslation, type TranslationKey } from '../../i18n';
import { Bot, Activity, Terminal, Layers, Sparkles, Target, Tv } from 'lucide-react';
import { BioMonitorTab } from './tabs/BioMonitorTab';
import { ThoughtsTab } from './tabs/ThoughtsTab';
import { GoalsTab } from './tabs/GoalsTab';
import { ToolWorkbenchTab } from './tabs/ToolWorkbenchTab';
import { McpPluginsTab } from './tabs/McpPluginsTab';
import { DesktopOverlayTab } from './tabs/DesktopOverlayTab';

export const CompanionView: React.FC = () => {
  const { t, tOptional } = useTranslation();
  const { companionState, fetchCompanionState, fetchMcpServers, fetchCompanionPlugins, fetchEnvironmentSnapshot } =
    useStoreFields('companionState', 'fetchCompanionState', 'fetchMcpServers', 'fetchCompanionPlugins', 'fetchEnvironmentSnapshot');

  const [activeSubTab, setActiveSubTab] = useState<'monitor' | 'thoughts' | 'goals' | 'tools' | 'mcp' | 'overlay'>('monitor');

  useEffect(() => {
    fetchCompanionState();
    fetchMcpServers();
    fetchCompanionPlugins();
    fetchEnvironmentSnapshot();

    const interval = setInterval(fetchCompanionState, 10000);
    return () => clearInterval(interval);
  }, [fetchCompanionState, fetchMcpServers, fetchCompanionPlugins, fetchEnvironmentSnapshot]);

  const hormones = companionState?.hormones;
  const emotion = companionState?.emotion;
  const thoughts = companionState?.scratchpad || [];
  const goals = companionState?.goals || [];

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-y-auto p-4 lg:p-6 space-y-6 relative text-slate-100">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-linear-to-r from-slate-900/90 via-cyan-950/20 to-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              {t('comp.title')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('comp.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-1.5 shadow-sm">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('comp.mood')} <strong>{hormones?.mood_label ? tOptional(`mood.${hormones.mood_label}`, hormones.mood_label) : t('comp.active')}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-accent-300 flex items-center gap-1.5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span>{t('comp.emotion')} <strong>
                {(() => {
                  const current = emotion?.current || 'warm';
                  const key = `comp.emo.${current}`;
                  return key in LOCALES.de ? t(key as TranslationKey) : current;
                })()}
              </strong></span>
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('monitor')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'monitor'
              ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t('comp.tabBio')}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('thoughts')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'thoughts'
              ? 'bg-accent-950/60 border-accent-500/50 text-accent-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-accent-400" />
          <span>{t('comp.tabThoughts', { count: thoughts.length })}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('goals')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'goals'
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('comp.tabGoals', { count: goals.length })}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tools')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'tools'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t('comp.tabTools')}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('mcp')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'mcp'
              ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t('comp.tabMcp')}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('overlay')}
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
            activeSubTab === 'overlay'
              ? 'bg-blue-950/60 border-blue-500/50 text-blue-300 shadow-sm'
              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tv className="w-3.5 h-3.5 text-blue-400" />
          <span>{t('comp.tabOverlay')}</span>
        </button>
      </div>


      {activeSubTab === 'monitor' && <BioMonitorTab />}
      {activeSubTab === 'thoughts' && <ThoughtsTab />}
      {activeSubTab === 'goals' && <GoalsTab />}
      {activeSubTab === 'tools' && <ToolWorkbenchTab />}
      {activeSubTab === 'mcp' && <McpPluginsTab />}
      {activeSubTab === 'overlay' && <DesktopOverlayTab />}
    </div>
  );
};
