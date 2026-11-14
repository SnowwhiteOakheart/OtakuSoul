import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { LOCALES, useTranslation, type TranslationKey } from '../../i18n';
import { Bot, Activity, Terminal, Layers, Sparkles, Target, Tv, type LucideIcon } from 'lucide-react';
import { BioMonitorTab } from './tabs/BioMonitorTab';
import { ThoughtsTab } from './tabs/ThoughtsTab';
import { GoalsTab } from './tabs/GoalsTab';
import { ToolWorkbenchTab } from './tabs/ToolWorkbenchTab';
import { McpPluginsTab } from './tabs/McpPluginsTab';
import { DesktopPetTab } from './tabs/DesktopPetTab';

type CompanionTab = 'monitor' | 'thoughts' | 'goals' | 'tools' | 'mcp' | 'overlay';

export const CompanionView: React.FC = () => {
  const { t, tOptional } = useTranslation();
  const { companionState, fetchCompanionState, fetchMcpServers, fetchCompanionPlugins, fetchEnvironmentSnapshot } =
    useStoreFields('companionState', 'fetchCompanionState', 'fetchMcpServers', 'fetchCompanionPlugins', 'fetchEnvironmentSnapshot');

  const [activeSubTab, setActiveSubTab] = useState<CompanionTab>('monitor');

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

  const tabs: { id: CompanionTab; icon: LucideIcon; label: string; active: string; iconColor: string }[] = [
    { id: 'monitor', icon: Activity, label: t('comp.tabBio'), active: 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300', iconColor: 'text-cyan-400' },
    {
      id: 'thoughts',
      icon: Sparkles,
      label: t('comp.tabThoughts', { count: thoughts.length }),
      active: 'bg-accent-950/60 border-accent-500/50 text-accent-300',
      iconColor: 'text-accent-400',
    },
    {
      id: 'goals',
      icon: Target,
      label: t('comp.tabGoals', { count: goals.length }),
      active: 'bg-amber-950/60 border-amber-500/50 text-amber-300',
      iconColor: 'text-amber-400',
    },
    { id: 'tools', icon: Terminal, label: t('comp.tabTools'), active: 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300', iconColor: 'text-emerald-400' },
    { id: 'mcp', icon: Layers, label: t('comp.tabMcp'), active: 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300', iconColor: 'text-indigo-400' },
    { id: 'overlay', icon: Tv, label: t('comp.tabOverlay'), active: 'bg-blue-950/60 border-blue-500/50 text-blue-300', iconColor: 'text-blue-400' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-y-auto p-4 lg:p-6 space-y-6 relative text-slate-100">
      {/* Header Banner */}
      <div className="shrink-0 p-4 sm:p-5 rounded-2xl bg-linear-to-r from-slate-900/90 via-cyan-950/20 to-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
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

      {/* Navigation: wraps onto more lines instead of squeezing (in a scrolling column a row
          with its own overflow would shrink to nothing under long content). */}
      <div
        role="tablist"
        aria-label={t('comp.title')}
        className="shrink-0 flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3 text-xs font-semibold"
      >
        {tabs.map(({ id, icon: Icon, label, active, iconColor }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeSubTab === id}
            onClick={() => setActiveSubTab(id)}
            className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl border flex items-center gap-2 transition ${
              activeSubTab === id ? `${active} shadow-sm` : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeSubTab === 'monitor' && <BioMonitorTab />}
      {activeSubTab === 'thoughts' && <ThoughtsTab />}
      {activeSubTab === 'goals' && <GoalsTab />}
      {activeSubTab === 'tools' && <ToolWorkbenchTab />}
      {activeSubTab === 'mcp' && <McpPluginsTab />}
      {activeSubTab === 'overlay' && <DesktopPetTab />}
    </div>
  );
};
