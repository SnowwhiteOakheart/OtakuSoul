import { AvatarMotionsSettings } from '../AvatarMotionsSettings';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation, type SupportedLanguage } from '../../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../../../services/api';
import { toast } from '../../ui/feedback';
import { Toggle } from '../../ui/Toggle';
import { errorMessage } from '../../../utils/errors';
import { APP_THEMES } from '../themes';
import {
  Terminal,
  FolderOpen,
  Box,
  Sparkles,
  Check,
  Smile,
  Palette,
  Globe,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import type { ColorModePreference } from '../../../services/theme';

const COLOR_MODES: { id: ColorModePreference; icon: typeof Monitor }[] = [
  { id: 'system', icon: Monitor },
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
];

export const GeneralSettings = () => {
  const { t } = useTranslation();
  const {
    appPaths, theme, setTheme, colorMode, setColorMode, appLanguage, setAppLanguage, setIsLogViewerOpen, setIsUpdaterOpen,
    scannedVrms, activeVrmPath, setActiveVrmPath, refreshVrmModels, scannedLive2ds, activeLive2dPath,
    setActiveLive2dPath, refreshLive2dModels, replyLanguage, setReplyLanguage, closeToTray, setCloseToTray,
  } = useStoreFields(
    'appPaths', 'theme', 'setTheme', 'colorMode', 'setColorMode', 'appLanguage', 'setAppLanguage', 'setIsLogViewerOpen', 'setIsUpdaterOpen',
    'scannedVrms', 'activeVrmPath', 'setActiveVrmPath', 'refreshVrmModels', 'scannedLive2ds', 'activeLive2dPath',
    'setActiveLive2dPath', 'refreshLive2dModels', 'replyLanguage', 'setReplyLanguage', 'closeToTray', 'setCloseToTray',
  );

  const handleBrowseVrm = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: translate('settings.fileFilterVrm'),
            extensions: ['vrm'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const imported = await api.importVrmModel(selected);
        await refreshVrmModels();
        setActiveVrmPath(imported.path);
        toast.success(translate('settings.vrmImported', { name: imported.name }));
      }
    } catch (e) {
      console.error('Failed to import VRM:', e);
      toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    }
  };

  const handleBrowseLive2d = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: translate('settings.fileFilterLive2d'),
            extensions: ['zip', 'json'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const imported = await api.importLive2dModel(selected);
        await refreshLive2dModels();
        setActiveLive2dPath(imported.model_path);
        toast.success(translate('settings.live2dImported', { name: imported.name }));
      }
    } catch (e) {
      console.error('Failed to import Live2D model:', e);
      toast.error(translate('settings.importFailed', { error: errorMessage(e) }));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Theme-Auswahl */}
      <div id="setting-theme" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent-400" />
            {t('settings.theme')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('settings.themeIntro')}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-y border-slate-800 py-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-200">{t('settings.colorMode')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('settings.colorModeIntro')}</p>
          </div>
          <div role="group" aria-label={t('settings.colorMode')} className="grid grid-cols-3 shrink-0 rounded-lg border border-slate-700 bg-app/70 p-1">
            {COLOR_MODES.map(({ id, icon: Icon }) => {
              const selected = colorMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setColorMode(id)}
                  className={`h-8 min-w-24 px-3 rounded-md flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-accent-600 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t(`settings.colorMode.${id}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {APP_THEMES.map((th) => {
            const isSelected = (theme || 'obsidian') === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => setTheme(th.id)}
                aria-pressed={isSelected}
                className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-accent-500/80 bg-accent-950/20 shadow-lg shadow-accent-950/30'
                    : 'border-slate-800 bg-app/60 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-xs text-slate-200">{th.name}</span>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-400 mt-1 mb-3">{t(`settings.theme.${th.id}`)}</span>

                {/* Farbmuster */}
                <div className="flex items-center gap-1.5 mt-auto">
                  <div
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ backgroundColor: th.bg }}
                    title={t('settings.swatchBg')}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ backgroundColor: th.primary }}
                    title={t('settings.swatchPrimary')}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ backgroundColor: th.accent }}
                    title={t('settings.swatchAccent')}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Sprachauswahl UI */}
      <div id="setting-language" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            {t('settings.language')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('settings.languageIntro')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'de', label: 'Deutsch', sub: t('settings.langDeSub') },
            { id: 'en', label: 'English', sub: t('settings.langEnSub') },
            { id: 'ru', label: 'Русский', sub: t('settings.langRuSub') },
          ].map((l) => {
            const isSelected = (appLanguage || 'de') === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setAppLanguage(l.id as SupportedLanguage)}
                aria-pressed={isSelected}
                lang={l.id}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500/80 bg-cyan-950/20 text-cyan-300 shadow-sm'
                    : 'border-slate-800 bg-app/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-slate-200">{l.label}</div>
                  <div className="text-[11px] text-slate-400">{l.sub}</div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Antwort-Sprache (Roleplay default reply language) */}
      <div id="setting-reply-language" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            {t('settings.replyLanguage')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('settings.replyLanguageIntro')}</p>
        </div>

        <div className="max-w-xs">
          {/* The value is written verbatim into the system prompt ("Antworte auf **Deutsch**"), so store language names, not codes. */}
          <select
            aria-label={t('settings.replyLanguage')}
            value={replyLanguage || 'Deutsch'}
            onChange={(e) => setReplyLanguage(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-app border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
          >
            <option value="Deutsch">Deutsch</option>
            <option value="English">English</option>
            <option value="Русский">Русский</option>
            <option value="日本語">日本語</option>
            <option value="Français">Français</option>
            <option value="Español">Español</option>
          </select>
        </div>
      </div>

      {/* 4. System-Diagnose & Updates */}
      <div id="setting-system" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            {t('settings.systemTitle')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('settings.systemIntro')}</p>
        </div>

        <Toggle
          id="setting-close-to-tray"
          checked={closeToTray}
          onCheckedChange={setCloseToTray}
          label={t('settings.closeToTray')}
          description={t(closeToTray ? 'settings.closeToTrayOn' : 'settings.closeToTrayOff')}
          className="-mx-2"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsLogViewerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700/60"
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>{t('settings.openLogs')}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUpdaterOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent-600/20 hover:bg-accent-600/30 text-accent-300 text-xs font-medium transition-colors border border-accent-500/40"
          >
            <Sparkles className="w-4 h-4 text-accent-400" />
            <span>{t('header.update')}</span>
          </button>
        </div>

        <div className="p-3 rounded-lg bg-app/80 border border-slate-800/80 text-xs text-slate-400 font-mono space-y-1">
          <div>
            {t('settings.version')}: <span className="text-accent-300 font-semibold">{t('header.version')}</span>
          </div>
          <div className="select-text break-all">
            {t('settings.dataDir')}: <span className="text-slate-300">{appPaths?.data_dir ?? '…'}</span>
          </div>
          <div className="select-text break-all">
            {t('settings.configDir')}: <span className="text-slate-300">{appPaths?.config_dir ?? '…'}</span>
          </div>
        </div>
      </div>
      {/* 4. Standard-Avatare (VRM & Live2D) */}
      <h2 id="setting-avatars" className="text-sm font-semibold text-slate-200 pt-2">{t('settings.avatarDefaults')}</h2>
      {/* 3D Avatar (VRM) Standard-Auswahl */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5 text-accent2-400" />
          <span>{t('settings.vrmDefault')}</span>
        </h3>
        <div className="flex gap-2 text-xs">
          <select
            aria-label={t('settings.vrmDefault')}
            value={activeVrmPath || ''}
            onChange={(e) => setActiveVrmPath(e.target.value || null)}
            className="flex-1 bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
          >
            {scannedVrms.map((vrm, idx) => (
              <option key={idx} value={vrm.path}>
                {vrm.name} ({vrm.size_mb.toFixed(0)} MB)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBrowseVrm}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('settings.importVrm')}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <p className="max-w-xl">{t('settings.avatarPackHint')}</p>
          <button
            type="button"
            onClick={() => void api.openAvatarFolder().catch((e) => toast.error(errorMessage(e)))}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('settings.openAvatarFolder')}</span>
          </button>
        </div>
      </div>

      <AvatarMotionsSettings />

      {/* 2D Live2D Standard-Auswahl & Import */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Smile className="w-3.5 h-3.5 text-accent-400" />
            <span>{t('settings.live2dDefault')}</span>
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            aria-label={t('settings.live2dDefault')}
            value={activeLive2dPath || ''}
            onChange={(e) => setActiveLive2dPath(e.target.value || null)}
            className="flex-1 min-w-[200px] bg-app border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-accent-500"
          >
            {scannedLive2ds.map((l2d, idx) => (
              <option key={idx} value={l2d.model_path}>
                {l2d.name} ({l2d.id})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleBrowseLive2d}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            title={t('settings.importLive2dHint')}
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent-400" />
            <span className="whitespace-nowrap">{t('settings.importLive2d')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
