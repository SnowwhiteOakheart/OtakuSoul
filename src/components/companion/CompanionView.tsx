import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { SafetyCountdownBanner } from './SafetyCountdownBanner';
import { LOCALES, useTranslation, type TranslationKey } from '../../i18n';
import {
  Bot,
  Activity,
  Heart,
  Zap,
  Flame,
  Moon,
  Smile,
  Shield,
  Clock,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
  Eye,
  Cpu,
  Layers,
  Sparkles,
  Target,
  Trash2,
  Check,
  Plus,
  RefreshCw,
  Sliders,
  Tv,
} from 'lucide-react';

export const CompanionView: React.FC = () => {
  const { t } = useTranslation();
  const appPaths = useAppStore((s) => s.appPaths);
  const {
    companionState,
    fetchCompanionState,
    applyHormoneInteraction,
    setHormones,
    requestToolCall,
    updateCompanionSettings,
    addCompanionThought,
    clearCompanionThoughts,
    addCompanionGoal,
    markCompanionGoalCompleted,
    deleteCompanionGoal,
    environmentSnapshot,
    fetchEnvironmentSnapshot,
    mcpServers,
    fetchMcpServers,
    toggleMcpServer,
    companionPlugins,
    fetchCompanionPlugins,
    toggleCompanionOverlay,
    detectDesktopWindow,
  } = useAppStore();

  const [activeSubTab, setActiveSubTab] = useState<'monitor' | 'thoughts' | 'goals' | 'tools' | 'mcp' | 'overlay'>('monitor');

  // Tool Workbench Form States
  const [selectedTool, setSelectedTool] = useState<string>('web_search');
  const [toolArgPrimary, setToolArgPrimary] = useState<string>('OtakuSoul Three.js VRM LipSync');
  const [toolArgSecondary, setToolArgSecondary] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<'powershell' | 'bash' | 'cmd' | 'python'>('powershell');

  // Thoughts Form
  const [newThoughtInput, setNewThoughtInput] = useState<string>('');

  // Goals Form
  const [goalSummaryInput, setGoalSummaryInput] = useState<string>('');
  const [goalDueMinutes, setGoalDueMinutes] = useState<number>(30);

  // Hormones Slider States
  const [sliderDopamine, setSliderDopamine] = useState<number>(65);
  const [sliderCortisol, setSliderCortisol] = useState<number>(20);
  const [sliderOxytocin, setSliderOxytocin] = useState<number>(75);
  const [sliderFatigue, setSliderFatigue] = useState<number>(15);

  // Overlay state
  const [overlayClickThrough, setOverlayClickThrough] = useState<boolean>(false);
  const [currentWindowTitle, setCurrentWindowTitle] = useState<string>('Desktop');

  useEffect(() => {
    fetchCompanionState();
    fetchMcpServers();
    fetchCompanionPlugins();
    fetchEnvironmentSnapshot();

    const interval = setInterval(() => {
      fetchCompanionState();
      detectDesktopWindow().then(title => {
        if (title) setCurrentWindowTitle(title);
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchCompanionState, fetchMcpServers, fetchCompanionPlugins, fetchEnvironmentSnapshot, detectDesktopWindow]);

  useEffect(() => {
    if (companionState?.hormones) {
      setSliderDopamine(Math.round(companionState.hormones.dopamine));
      setSliderCortisol(Math.round(companionState.hormones.cortisol));
      setSliderOxytocin(Math.round(companionState.hormones.oxytocin));
      setSliderFatigue(Math.round(companionState.hormones.fatigue));
    }
    if (companionState?.active_window_title) {
      setCurrentWindowTitle(companionState.active_window_title);
    }
  }, [companionState]);

  const hormones = companionState?.hormones;
  const emotion = companionState?.emotion;
  const settings = companionState?.settings;
  const history = companionState?.tool_history || [];
  const thoughts = companionState?.scratchpad || [];
  const goals = companionState?.goals || [];

  const handleApplySliders = async () => {
    await setHormones(sliderDopamine, sliderCortisol, sliderOxytocin, sliderFatigue);
  };

  const handleRunTool = async (e: React.FormEvent) => {
    e.preventDefault();
    let args: Record<string, any> = {};

    switch (selectedTool) {
      case 'web_search':
        args = { query: toolArgPrimary };
        break;
      case 'open_external_url':
        args = { url: toolArgPrimary };
        break;
      case 'get_system_info':
      case 'get_environment_snapshot':
      case 'read_clipboard':
      case 'take_screenshot':
        args = {};
        break;
      case 'media_control':
        args = { action: toolArgPrimary || 'play-pause' };
        break;
      case 'app_control':
        args = { action: toolArgPrimary || 'launch', target: toolArgSecondary };
        break;
      case 'gui_action':
        args = { action: toolArgPrimary || 'type_text', text: toolArgSecondary };
        break;
      case 'browse_web':
        args = { url: toolArgPrimary };
        break;
      case 'execute_code':
        args = { language: codeLanguage, code: toolArgPrimary, timeout_seconds: 25 };
        break;
      case 'file_organizer':
        args = { action: toolArgPrimary || 'list', target_folder: toolArgSecondary || 'desktop' };
        break;
      case 'plan_and_execute':
        args = { goal: toolArgPrimary };
        break;
      case 'set_timer':
        args = { seconds: parseInt(toolArgPrimary) || 60, label: toolArgSecondary || 'OtakuSoul Timer' };
        break;
      default:
        args = { input: toolArgPrimary };
    }

    await requestToolCall(selectedTool, args);
  };

  const handleToggleAutoApprove = () => {
    if (!settings) return;
    updateCompanionSettings({
      ...settings,
      auto_approve_safe_tools: !settings.auto_approve_safe_tools,
    });
  };

  const handleAddThought = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThoughtInput.trim()) return;
    await addCompanionThought(newThoughtInput.trim());
    setNewThoughtInput('');
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalSummaryInput.trim()) return;
    await addCompanionGoal(goalSummaryInput.trim(), goalDueMinutes);
    setGoalSummaryInput('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-y-auto p-4 lg:p-6 space-y-6 relative text-slate-100">
      {/* Global Safety Countdown Banner */}
      <SafetyCountdownBanner />

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
            <span>{t('comp.mood')} <strong>{hormones?.mood_label || t('comp.active')}</strong></span>
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
          <span>Gedankenspeicher ({thoughts.length})</span>
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
          <span>Versprechen & Ziele ({goals.length})</span>
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

      {/* Tab 1: Bio-Monitor & Gemüt */}
      {activeSubTab === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Hormones & Energy */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent2-400" />
                  {t('comp.bioTitle')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('comp.bioIntro')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-300 px-2 py-0.5 rounded bg-slate-800">
                  Energie: {hormones?.energy_level}%
                </span>
                {hormones && hormones.fatigue >= 95 && (
                  <span className="text-xs font-mono text-indigo-300 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-500/40">
                    {t('comp.sleeping')}
                  </span>
                )}
                {hormones && hormones.oxytocin <= 25 && (
                  <span className="text-xs font-mono text-rose-300 px-2 py-0.5 rounded bg-rose-950 border border-rose-500/40">
                    {t('comp.lonely')}
                  </span>
                )}
              </div>
            </div>

            {/* 4 Hormone Gauges */}
            {hormones && (
              <div className="grid grid-cols-2 gap-3.5">
                {/* Dopamine */}
                <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      {t('comp.dopamine')}
                    </span>
                    <span className="font-mono text-amber-300 font-bold">{Math.round(hormones.dopamine)}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-linear-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                      style={{ width: `${hormones.dopamine}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">{t('comp.dopamineHint')}</span>
                </div>

                {/* Cortisol */}
                <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      {t('comp.cortisol')}
                    </span>
                    <span className="font-mono text-rose-300 font-bold">{Math.round(hormones.cortisol)}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-linear-to-r from-rose-500 to-red-600 rounded-full transition-all duration-500"
                      style={{ width: `${hormones.cortisol}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">{t('comp.cortisolHint')}</span>
                </div>

                {/* Oxytocin */}
                <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-accent2-400 fill-accent2-400/40" />
                      {t('comp.oxytocin')}
                    </span>
                    <span className="font-mono text-accent2-300 font-bold">{Math.round(hormones.oxytocin)}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-linear-to-r from-accent2-500 to-rose-400 rounded-full transition-all duration-500"
                      style={{ width: `${hormones.oxytocin}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">{t('comp.oxytocinHint')}</span>
                </div>

                {/* Fatigue */}
                <div className="p-3.5 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      {t('comp.fatigue')}
                    </span>
                    <span className="font-mono text-indigo-300 font-bold">{Math.round(hormones.fatigue)}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-linear-to-r from-indigo-500 to-accent-500 rounded-full transition-all duration-500"
                      style={{ width: `${hormones.fatigue}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">{t('comp.fatigueHint')}</span>
                </div>
              </div>
            )}

            {/* Quick Impulses */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                {t('comp.impulses')}
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => applyHormoneInteraction('compliment')}
                  className="px-3 py-1.5 rounded-lg bg-accent2-900/40 hover:bg-accent2-800/50 text-accent2-300 border border-accent2-500/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Smile className="w-3.5 h-3.5" />
                  {t('comp.compliment')}
                </button>
                <button
                  onClick={() => applyHormoneInteraction('challenge')}
                  className="px-3 py-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {t('comp.challenge')}
                </button>
                <button
                  onClick={() => applyHormoneInteraction('conflict')}
                  className="px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/50 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Flame className="w-3.5 h-3.5" />
                  {t('comp.conflict')}
                </button>
                <button
                  onClick={() => applyHormoneInteraction('rest')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Moon className="w-3.5 h-3.5" />
                  {t('comp.rest')}
                </button>
              </div>
            </div>
          </div>

          {/* Right: 10 Affective Emotions & Sliders */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-400" />
                {t('comp.matrix')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('comp.matrixIntro')}
              </p>
            </div>

            {/* Emotion Badges */}
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'neutral', label: t('comp.emo.neutral') },
                { name: 'curious', label: t('comp.emo.curious') },
                { name: 'warm', label: t('comp.emo.warm') },
                { name: 'amused', label: t('comp.emo.amused') },
                { name: 'concerned', label: t('comp.emo.concerned') },
                { name: 'playful', label: t('comp.emo.playful') },
                { name: 'relaxed', label: t('comp.emo.relaxed') },
                { name: 'sleepy', label: t('comp.emo.sleepy') },
                { name: 'melancholy', label: t('comp.emo.melancholy') },
                { name: 'excited', label: t('comp.emo.excited') },
              ].map((emo) => {
                const isCurrent = emotion?.current === emo.name;
                const score = emotion?.ema_scores?.[emo.name] || 0;
                return (
                  <div
                    key={emo.name}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition ${
                      isCurrent
                        ? 'bg-accent-900/60 border-accent-500 text-accent-200 shadow-md shadow-accent-950/40 ring-1 ring-accent-400'
                        : 'bg-app/50 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>{emo.label}</span>
                    <span className="font-mono text-[11px] opacity-75">
                      {(score * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hormone Sliders */}
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{t('comp.manual')}</span>
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
              </span>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Dopamin: {sliderDopamine}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderDopamine}
                    onChange={(e) => setSliderDopamine(parseInt(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Cortisol: {sliderCortisol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderCortisol}
                    onChange={(e) => setSliderCortisol(parseInt(e.target.value))}
                    className="w-full accent-rose-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Oxytocin: {sliderOxytocin}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderOxytocin}
                    onChange={(e) => setSliderOxytocin(parseInt(e.target.value))}
                    className="w-full accent-accent2-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Erschöpfung: {sliderFatigue}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderFatigue}
                    onChange={(e) => setSliderFatigue(parseInt(e.target.value))}
                    className="w-full accent-indigo-400"
                  />
                </div>
              </div>

              <button
                onClick={handleApplySliders}
                className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                {t('comp.applyLevels')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Gedankenspeicher (Scratchpad) */}
      {activeSubTab === 'thoughts' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent-400" />
                  {t('comp.scratchpad')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('comp.scratchpadIntro')}
                </p>
              </div>

              <button
                onClick={clearCompanionThoughts}
                className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('comp.clearThoughts')}
              </button>
            </div>

            {/* Add Thought Form */}
            <form onSubmit={handleAddThought} className="flex gap-2">
              <input
                type="text"
                value={newThoughtInput}
                onChange={(e) => setNewThoughtInput(e.target.value)}
                placeholder={t('comp.thoughtPlaceholder')}
                className="flex-1 px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              />
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('comp.addThought')}
              </button>
            </form>
          </div>

          {/* Thoughts List */}
          <div className="space-y-2.5">
            {thoughts.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs flex items-start justify-between gap-4 shadow-sm"
              >
                <div className="space-y-1">
                  <span className="text-[11px] text-accent-400 font-mono font-bold block">
                    {t('comp.innerThought')}
                  </span>
                  <p className="text-slate-200 italic leading-relaxed">
                    "{item.thought}"
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {new Date(item.ts * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))}

            {thoughts.length === 0 && (
              <div className="p-12 text-center text-xs text-slate-500 italic rounded-2xl border border-slate-800 bg-slate-900/30">
                {t('comp.noThoughts')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Versprechen & Ziele (GoalsManager) */}
      {activeSubTab === 'goals' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
            <div className="border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                {t('comp.goals')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('comp.goalsIntro')}
              </p>
            </div>

            {/* New Goal Form */}
            <form onSubmit={handleAddGoal} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={goalSummaryInput}
                onChange={(e) => setGoalSummaryInput(e.target.value)}
                placeholder={t('comp.promisePlaceholder')}
                className="flex-1 min-w-[240px] px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-amber-500"
              />

              <select
                value={goalDueMinutes}
                onChange={(e) => setGoalDueMinutes(parseInt(e.target.value))}
                className="px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-hidden"
              >
                <option value={15}>{t('comp.in15')}</option>
                <option value={30}>{t('comp.in30')}</option>
                <option value={60}>{t('comp.in60')}</option>
                <option value={120}>{t('comp.in120')}</option>
                <option value={240}>{t('comp.tonight')}</option>
                <option value={720}>{t('comp.tomorrow')}</option>
              </select>

              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('comp.addPromise')}
              </button>
            </form>
          </div>

          {/* Goals List */}
          <div className="space-y-2.5">
            {goals.map((g) => {
              const isPending = g.status === 'pending';
              return (
                <div
                  key={g.id}
                  className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-4 transition shadow-sm ${
                    isPending
                      ? 'bg-slate-900/80 border-amber-500/30'
                      : 'bg-app/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                          isPending
                            ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isPending ? 'Ausstehend' : 'Erledigt'}
                      </span>
                      <span className="font-bold text-slate-100">{g.summary}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono block">
                      Fällig: {new Date(g.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Erstellt: {new Date(g.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isPending && (
                      <button
                        onClick={() => markCompanionGoalCompleted(g.id)}
                        className="px-3 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-1 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t('comp.done')}
                      </button>
                    )}
                    <button
                      onClick={() => deleteCompanionGoal(g.id)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {goals.length === 0 && (
              <div className="p-12 text-center text-xs text-slate-500 italic rounded-2xl border border-slate-800 bg-slate-900/30">
                {t('comp.noGoals')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Desktop-Werkbank (Echte Tools) */}
      {activeSubTab === 'tools' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tool Launcher Form */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  {t('comp.toolsTitle')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('comp.toolsIntro')}
                </p>
              </div>

              <form onSubmit={handleRunTool} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    {t('comp.chooseTool')}
                  </label>
                  <select
                    value={selectedTool}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTool(val);
                      if (val === 'web_search') {
                        setToolArgPrimary('OtakuSoul Three.js VRM LipSync');
                        setToolArgSecondary('');
                      } else if (val === 'open_external_url') {
                        setToolArgPrimary('https://github.com/SnowwhiteOakheart/OtakuSoul');
                        setToolArgSecondary('');
                      } else if (val === 'execute_code') {
                        setToolArgPrimary('print("Hallo aus der OtakuSoul Sandbox!")\nimport sys\nprint("Python Version:", sys.version)');
                        setToolArgSecondary('');
                      } else if (val === 'app_control') {
                        setToolArgPrimary('launch');
                        setToolArgSecondary('kcalc');
                      } else if (val === 'gui_action') {
                        setToolArgPrimary('type_text');
                        setToolArgSecondary('Hallo Welt!');
                      } else if (val === 'file_organizer') {
                        setToolArgPrimary('list');
                        setToolArgSecondary('desktop');
                      } else if (val === 'media_control') {
                        setToolArgPrimary('play-pause');
                        setToolArgSecondary('');
                      } else {
                        setToolArgPrimary('');
                        setToolArgSecondary('');
                      }
                    }}
                    className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500 font-mono"
                  >
                    <option value="web_search">{t('comp.tool.search')}</option>
                    <option value="open_external_url">{t('comp.tool.openUrl')}</option>
                    <option value="get_system_info">{t('comp.tool.sysinfo')}</option>
                    <option value="get_environment_snapshot">{t('comp.tool.vitals')}</option>
                    <option value="take_screenshot">{t('comp.tool.screenshot')}</option>
                    <option value="read_clipboard">{t('comp.tool.clipboard')}</option>
                    <option value="media_control">{t('comp.tool.media')}</option>
                    <option value="app_control">{t('comp.tool.app')}</option>
                    <option value="gui_action">{t('comp.tool.gui')}</option>
                    <option value="browse_web">{t('comp.tool.read')}</option>
                    <option value="execute_code">{t('comp.tool.code')}</option>
                    <option value="file_organizer">{t('comp.tool.files')}</option>
                    <option value="plan_and_execute">{t('comp.tool.planner')}</option>
                    <option value="set_timer">{t('comp.tool.timer')}</option>
                  </select>
                </div>

                {selectedTool === 'execute_code' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      {t('comp.interpreter')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCodeLanguage('powershell');
                          setToolArgPrimary('Write-Output "Hallo aus der OtakuSoul Sandbox!"\nGet-Date');
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs font-mono transition ${
                          codeLanguage === 'powershell'
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                            : 'bg-app border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        PowerShell (Windows)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeLanguage('bash');
                          setToolArgPrimary('echo "Hallo aus der OtakuSoul Sandbox!"\nuname -a');
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs font-mono transition ${
                          codeLanguage === 'bash'
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                            : 'bg-app border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Bash (Linux / macOS)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeLanguage('cmd');
                          setToolArgPrimary('@echo off\necho Hallo aus der OtakuSoul Sandbox!\nver');
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs font-mono transition ${
                          codeLanguage === 'cmd'
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                            : 'bg-app border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Batch / CMD (Windows)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeLanguage('python');
                          setToolArgPrimary('print("Hallo aus der OtakuSoul Sandbox!")\nimport sys\nprint("Python Version:", sys.version)');
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs font-mono transition ${
                          codeLanguage === 'python'
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                            : 'bg-app border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t('comp.python')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Primary Argument */}
                {selectedTool !== 'get_system_info' && selectedTool !== 'get_environment_snapshot' && selectedTool !== 'read_clipboard' && selectedTool !== 'take_screenshot' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      {selectedTool === 'execute_code' ? 'Code-Inhalt' : 'Haupt-Parameter'}
                    </label>
                    {selectedTool === 'execute_code' ? (
                      <textarea
                        rows={4}
                        value={toolArgPrimary}
                        onChange={(e) => setToolArgPrimary(e.target.value)}
                        className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-hidden focus:border-emerald-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={toolArgPrimary}
                        onChange={(e) => setToolArgPrimary(e.target.value)}
                        className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-hidden focus:border-emerald-500"
                      />
                    )}
                  </div>
                )}

                {/* Secondary Argument */}
                {(selectedTool === 'app_control' || selectedTool === 'gui_action' || selectedTool === 'file_organizer' || selectedTool === 'set_timer') && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      {t('comp.secondParam')}
                    </label>
                    <input
                      type="text"
                      value={toolArgSecondary}
                      onChange={(e) => setToolArgSecondary(e.target.value)}
                      className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-linear-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  {t('comp.runTool')}
                </button>
              </form>

              {/* Safety Toggles */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings?.auto_approve_safe_tools ?? true}
                    onChange={handleToggleAutoApprove}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span>{t('comp.autoApprove')}</span>
                </label>

                <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{t('comp.countdown')}</span>
                </span>
              </div>
            </div>

            {/* Live Environment Snapshot */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  {t('comp.vitalsTitle')}
                </h3>
                <button
                  onClick={fetchEnvironmentSnapshot}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title={t('comp.reload')}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {environmentSnapshot ? (
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-app border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">{t('comp.cpu')}</span>
                    <span className="text-slate-100 font-bold text-sm">
                      {environmentSnapshot.cpu_usage_percent.toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-app border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">{t('comp.ram')}</span>
                    <span className="text-slate-100 font-bold text-sm">
                      {environmentSnapshot.ram_percent.toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {environmentSnapshot.ram_used_mb}MB / {environmentSnapshot.ram_total_mb}MB
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-app border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">{t('comp.disk')}</span>
                    <span className="text-slate-100 font-bold text-sm">
                      {environmentSnapshot.disk_free_gb.toFixed(1)} GB
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      von {environmentSnapshot.disk_total_gb.toFixed(1)} GB
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-app border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">{t('comp.gpu')}</span>
                    <span className="text-slate-100 font-bold text-sm">
                      {environmentSnapshot.gpu_name || 'NVIDIA GPU'}
                    </span>
                    <span className="text-[11px] text-emerald-400 block">
                      {environmentSnapshot.gpu_temp_c ? `${environmentSnapshot.gpu_temp_c}°C` : t('comp.active')} • VRAM {environmentSnapshot.gpu_vram_used_mb || 0}MB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  {t('comp.vitalsLoading')}
                </div>
              )}

              <div className="p-3 rounded-xl bg-app/70 border border-slate-800/80 text-xs font-mono text-slate-300">
                <span className="text-slate-500 block mb-0.5">{t('comp.activeWindow')}</span>
                <span className="text-cyan-300 font-bold">"{currentWindowTitle}"</span>
              </div>
            </div>
          </div>

          {/* Tool Execution History / Audit Log */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  {t('comp.audit')}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {history.length} Aktionen protokolliert
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.call_id}
                  className="p-3 rounded-xl bg-app/60 border border-slate-800 text-xs flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {item.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono font-bold text-slate-200">{item.tool_name}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                          item.success
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {item.success ? 'Erfolgreich' : 'Abgewiesen'}
                      </span>
                    </div>
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-app p-2 rounded-lg max-h-36 overflow-y-auto">
                      {item.output}
                    </pre>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {new Date(item.executed_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {history.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  {t('comp.noAudit')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: MCP & Plugins */}
      {activeSubTab === 'mcp' && (
        <div className="space-y-6">
          {/* MCP Servers */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  {t('comp.mcpTitle')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('comp.mcpIntro')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {mcpServers.map((srv) => (
                <div
                  key={srv.id}
                  className={`p-4 rounded-xl border text-xs space-y-2 transition ${
                    srv.enabled
                      ? 'bg-indigo-950/30 border-indigo-500/40'
                      : 'bg-app/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100 font-mono">{srv.name}</span>
                    <button
                      onClick={() => toggleMcpServer(srv.id, !srv.enabled)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold transition ${
                        srv.enabled
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {srv.enabled ? t('comp.active') : t('comp.inactive')}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 font-mono">
                    Transport: {srv.transport} • Befehl: {srv.command} {srv.args?.join(' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Companion Plugins */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                {t('comp.plugins')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('comp.pluginsDir', { path: `${appPaths?.data_dir ?? '…'}/companion/plugins/` })}
              </p>
            </div>

            <div className="space-y-2.5">
              {companionPlugins.map((plg) => (
                <div
                  key={plg.id}
                  className="p-3.5 rounded-xl bg-app border border-slate-800 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-slate-200">{plg.name}</span>
                    <p className="text-xs text-slate-400">{plg.description}</p>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    {plg.command}
                  </span>
                </div>
              ))}

              {companionPlugins.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  {t('comp.noPlugins')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Desktop-Overlay */}
      {activeSubTab === 'overlay' && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Tv className="w-4 h-4 text-blue-400" />
              {t('comp.overlayTitle')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('comp.overlayIntro')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-app border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-200">{t('comp.overlayControl')}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('comp.overlayText')}
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => toggleCompanionOverlay(true, overlayClickThrough)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {t('comp.overlayStart')}
                </button>
                <button
                  onClick={() => toggleCompanionOverlay(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-app border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-200">{t('comp.clickThrough')}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('comp.clickThroughText')}
              </p>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 pt-2">
                <input
                  type="checkbox"
                  checked={overlayClickThrough}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOverlayClickThrough(checked);
                    toggleCompanionOverlay(true, checked);
                  }}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>{t('comp.clickThroughToggle')}</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
