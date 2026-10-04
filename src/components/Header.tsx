import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useTranslation } from '../i18n';
import brandIconUrl from '../assets/brand/otakusoul-icon.png';
import { APP_NAME } from '../constants/branding';
import { AboutDialog } from './AboutDialog';
import { PersonaAvatar } from './characters/PersonaAvatar';
import { Cpu, AlertCircle, Loader2, Info, Terminal, Sparkles, Command } from 'lucide-react';

/** Server state changes quickly while starting; VRAM only matters as a rough gauge. */
const SERVER_POLL_MS = 3000;
const HARDWARE_POLL_MS = 10000;

const ACTION_BUTTON_CLASS =
  'flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 p-1.5 text-xs text-slate-400 outline-hidden transition-colors hover:border-accent-500/40 hover:text-accent-200 focus-visible:ring-2 focus-visible:ring-accent-400';

interface HeaderProps {
  onOpenCommandPalette: () => void;
}

export const Header = ({ onOpenCommandPalette }: HeaderProps) => {
  const [showAbout, setShowAbout] = useState(false);
  const { t } = useTranslation();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const hardware = useAppStore((s) => s.hardware);
  const fetchHardware = useAppStore((s) => s.fetchHardware);
  const serverStatus = useAppStore((s) => s.serverStatus);
  const fetchServerStatus = useAppStore((s) => s.fetchServerStatus);
  const initApp = useAppStore((s) => s.initApp);
  const setIsLogViewerOpen = useAppStore((s) => s.setIsLogViewerOpen);
  const setIsUpdaterOpen = useAppStore((s) => s.setIsUpdaterOpen);
  const activePersona = useAppStore((s) => s.activePersona);
  const setIsPersonaManagerOpen = useAppStore((s) => s.setIsPersonaManagerOpen);

  useEffect(() => {
    initApp();
    fetchHardware();
    fetchServerStatus();

    // nvidia-smi is spawned per hardware probe, so poll sparingly and never while hidden.
    let isFetchingHw = false;
    const pollHardware = () => {
      if (document.hidden || isFetchingHw) return;
      isFetchingHw = true;
      fetchHardware().finally(() => {
        isFetchingHw = false;
      });
    };
    const pollServer = () => {
      if (!document.hidden) fetchServerStatus();
    };
    const hardwareInterval = setInterval(pollHardware, HARDWARE_POLL_MS);
    const serverInterval = setInterval(pollServer, SERVER_POLL_MS);
    const handleVisibility = () => {
      if (!document.hidden) {
        pollServer();
        pollHardware();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(hardwareInterval);
      clearInterval(serverInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchHardware, fetchServerStatus, initApp]);

  const gpu = hardware?.gpus[0];

  return (
    <>
      <header className="relative h-14 shrink-0 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between gap-4 select-none z-50">
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          aria-label={t('header.home')}
          className="flex items-center gap-2 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <img src={brandIconUrl} alt="" className="h-8 w-8 rounded-lg object-cover shadow-md shadow-accent-950/70" />
          <span className="text-xl font-bold bg-linear-to-r from-accent-400 via-accent2-400 to-indigo-400 bg-clip-text text-transparent tracking-wide whitespace-nowrap">
            {APP_NAME}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-300 border border-accent-500/30 font-mono">
            {t('header.version')}
          </span>
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          {gpu && gpu.total_vram_mb > 0 && (
            <div
              title={t('header.gpuTooltip', {
                name: gpu.name,
                free: gpu.free_vram_mb.toLocaleString(),
                total: gpu.total_vram_mb.toLocaleString(),
              })}
              className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs text-slate-300 font-mono whitespace-nowrap"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-slate-200 hidden lg:inline">
                {gpu.name.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '') || 'GPU'}
              </span>
              <span
                className={`font-medium ${
                  gpu.free_vram_mb / gpu.total_vram_mb < 0.15
                    ? 'text-rose-400'
                    : gpu.free_vram_mb / gpu.total_vram_mb < 0.35
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {(gpu.free_vram_mb / 1024).toFixed(1)}GB
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-400">{(gpu.total_vram_mb / 1024).toFixed(1)}GB</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title={t('header.openServerSettings')}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-mono whitespace-nowrap outline-hidden transition-colors hover:border-slate-600 focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {serverStatus.state === 'running' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
                <span className="text-emerald-400 font-medium">{t('header.serverRunning')}</span>
                <span className="text-slate-400">:{serverStatus.port}</span>
              </>
            )}
            {serverStatus.state === 'starting' && (
              <>
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-400 font-medium">{t('header.serverStarting')}</span>
              </>
            )}
            {serverStatus.state === 'stopped' && (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span className="text-slate-400">{t('header.serverStopped')}</span>
              </>
            )}
            {serverStatus.state === 'failed' && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-400 font-medium">{t('header.serverFailed')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsPersonaManagerOpen(true)}
            title={t('header.persona', { name: activePersona.name })}
            aria-label={t('header.persona', { name: activePersona.name })}
            className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/70 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-300 outline-hidden transition-colors hover:border-accent-500/40 hover:text-accent-200 focus-visible:ring-2 focus-visible:ring-accent-400 min-w-0"
          >
            <PersonaAvatar persona={activePersona} className="w-6 h-6 text-[11px]" />
            <span className="hidden sm:inline max-w-32 truncate font-medium">{activePersona.name}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCommandPalette}
            className={ACTION_BUTTON_CLASS}
            title={t('palette.open')}
            aria-label={t('palette.open')}
          >
            <Command className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsLogViewerOpen(true)}
            className={ACTION_BUTTON_CLASS}
            title={t('header.logs')}
            aria-label={t('header.logs')}
          >
            <Terminal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsUpdaterOpen(true)}
            className={ACTION_BUTTON_CLASS}
            title={t('header.update')}
            aria-label={t('header.update')}
          >
            <Sparkles className="h-4 w-4 text-accent-400" />
          </button>

          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className={ACTION_BUTTON_CLASS}
            title={t('header.about')}
            aria-label={t('header.about')}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </>
  );
};
