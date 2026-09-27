import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import brandIconUrl from '../assets/brand/otakusoul-icon.png';
import { AboutDialog } from './AboutDialog';
import {
  Cpu,
  MessageSquare,
  Dice5,
  Bot,
  Settings,
  AlertCircle,
  Loader2,
  Users,
  BookOpen,
  Info,
  Compass,
  Layers,
} from 'lucide-react';

export const Header = () => {
  const [showAbout, setShowAbout] = useState(false);
  const {
    activeTab,
    setActiveTab,
    hardware,
    fetchHardware,
    serverStatus,
    fetchServerStatus,
    initApp,
  } = useAppStore();

  useEffect(() => {
    initApp();
    fetchHardware();
    fetchServerStatus();

    let isFetchingHw = false;
    const interval = setInterval(() => {
      fetchServerStatus();
      if (!isFetchingHw) {
        isFetchingHw = true;
        fetchHardware().finally(() => {
          isFetchingHw = false;
        });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const gpu = hardware?.gpus[0];

  return (
    <>
      <header className="relative h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between select-none z-50">
      {/* Brand & Tabs */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('chat')}>
          <img
            src={brandIconUrl}
            alt=""
            className="h-8 w-8 rounded-lg object-cover shadow-md shadow-purple-950/70"
          />
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent tracking-wide">
            OtakuSoul
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
            v0.1.0
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'chat'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('characters')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'characters'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Charaktere</span>
          </button>

          <button
            onClick={() => setActiveTab('hub')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'hub'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Compass className="w-4 h-4 text-purple-400" />
            <span>Soul Hub</span>
          </button>

          <button
            onClick={() => setActiveTab('lorebooks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'lorebooks'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Lorebooks</span>
          </button>

          <button
            onClick={() => setActiveTab('stage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'stage'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Dice5 className="w-4 h-4" />
            <span>Soul Stage</span>
          </button>

          <button
            onClick={() => setActiveTab('companion')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'companion'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Companion</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'integrations'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Integrationen</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              activeTab === 'settings'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Einstellungen</span>
          </button>
        </nav>
      </div>

      {/* Hardware & Server Status Widgets */}
      <div className="flex items-center gap-3">
        {/* GPU VRAM Widget */}
        {gpu && gpu.total_vram_mb > 0 && (
          <div
            title={`${gpu.name} – ${gpu.free_vram_mb.toLocaleString()} MB frei von ${gpu.total_vram_mb.toLocaleString()} MB`}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs text-slate-300 font-mono transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-slate-200">
              {gpu.name.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '') || 'GPU'}
            </span>
            <span className="text-slate-400">|</span>
            <span
              className={`font-medium transition-colors ${
                gpu.free_vram_mb / gpu.total_vram_mb < 0.15
                  ? 'text-rose-400'
                  : gpu.free_vram_mb / gpu.total_vram_mb < 0.35
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {(gpu.free_vram_mb / 1024).toFixed(1)}GB
            </span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{(gpu.total_vram_mb / 1024).toFixed(1)}GB</span>
          </div>
        )}

        {/* Server Status Pill */}
        <div
          onClick={() => setActiveTab('settings')}
          className="cursor-pointer flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-mono transition-colors hover:border-slate-600"
        >
          {serverStatus.state === 'running' && (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 font-medium">LLM Online</span>
              <span className="text-slate-500 text-[10px]">:{serverStatus.port}</span>
            </>
          )}
          {serverStatus.state === 'starting' && (
            <>
              <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-amber-400 font-medium">LLM Startet...</span>
            </>
          )}
          {serverStatus.state === 'stopped' && (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400">LLM Offline</span>
            </>
          )}
          {serverStatus.state === 'failed' && (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-rose-400 font-medium">Fehler</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 p-1.5 text-xs text-slate-400 transition-colors hover:border-purple-500/40 hover:text-purple-200"
          title="Über OtakuSoul"
          aria-label="Über OtakuSoul"
        >
          <Info className="h-4 w-4" />
          <span className="hidden 2xl:inline">Über</span>
        </button>
      </div>
    </header>

    {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
  </>
);
};
