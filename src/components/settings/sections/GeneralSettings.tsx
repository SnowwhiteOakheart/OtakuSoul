import { AvatarMotionsSettings } from '../AvatarMotionsSettings';
import { ModelFaceSettings } from '../ModelFaceSettings';
import { AvatarActions } from '../AvatarActions';
import { ResetSection } from '../ResetSection';
import { APPEARANCE_DEFAULTS } from '../../../utils/settingDefaults';
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { importLive2dFromDialog, importVrmFromDialog } from '../../avatars/avatarImport';
import { api } from '../../../services/api';
import { toast } from '../../ui/feedback';
import { Toggle } from '../../ui/Toggle';
import { NsfwSettings } from '../NsfwSettings';
import { ProactiveSettings } from '../ProactiveSettings';
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
  UserRound,
  RefreshCw,
  Upload,
  X,
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
    setActiveTab, availableLanguages, refreshLanguages, importUiLanguage, removeUiLanguage,
  } = useStoreFields(
    'appPaths', 'theme', 'setTheme', 'colorMode', 'setColorMode', 'appLanguage', 'setAppLanguage', 'setIsLogViewerOpen', 'setIsUpdaterOpen',
    'scannedVrms', 'activeVrmPath', 'setActiveVrmPath', 'refreshVrmModels', 'scannedLive2ds', 'activeLive2dPath',
    'setActiveLive2dPath', 'refreshLive2dModels', 'replyLanguage', 'setReplyLanguage', 'closeToTray', 'setCloseToTray',
    'setActiveTab', 'availableLanguages', 'refreshLanguages', 'importUiLanguage', 'removeUiLanguage',
  );
  const ownLanguages = availableLanguages.filter((l) => l.custom);

  const importLanguage = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t('settings.langImportFilter'), extensions: ['json'] }],
      });
      if (typeof selected !== 'string') return;
      const language = await importUiLanguage(selected);
      if (language) toast.success(t('settings.langImported', { name: language.name }));
    } catch (e) {
      toast.error(t('settings.langImportFailed', { error: errorMessage(e) }));
    }
  };

  // Avatars removed a moment ago (undo still possible) are left out of the lists.
  const [hidden, setHidden] = useState<string[]>([]);
  // The avatar imported last gets its name field opened once.
  const [justImported, setJustImported] = useState<string | null>(null);
  const vrms = scannedVrms.filter((vrm) => !hidden.includes(vrm.path));
  const live2ds = scannedLive2ds.filter((l2d) => !hidden.includes(l2d.model_path));
  const selectedVrm = vrms.find((vrm) => vrm.path === activeVrmPath);
  const selectedLive2d = live2ds.find((l2d) => l2d.model_path === activeLive2dPath);
  // Removing the chosen avatar picks another one; undo returns to it.
  const hideAvatar = (kind: 'vrm' | 'live2d', path: string) => {
    setHidden((list) => [...list, path]);
    if (kind === 'vrm' && activeVrmPath === path) setActiveVrmPath(vrms.find((v) => v.path !== path)?.path ?? null);
    if (kind === 'live2d' && activeLive2dPath === path) {
      setActiveLive2dPath(live2ds.find((l) => l.model_path !== path)?.model_path ?? null);
    }
  };
  const unhideAvatar = (kind: 'vrm' | 'live2d', path: string) => {
    setHidden((list) => list.filter((p) => p !== path));
    if (kind === 'vrm') setActiveVrmPath(path);
    else setActiveLive2dPath(path);
  };

  const handleBrowseVrm = async () => {
    const path = await importVrmFromDialog();
    if (!path) return;
    setActiveVrmPath(path);
    setJustImported(path);
  };

  const handleBrowseLive2d = async () => {
    const path = await importLive2dFromDialog();
    if (!path) return;
    setActiveLive2dPath(path);
    setJustImported(path);
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
          <div className="mt-1.5">
            <ResetSection
              area={t('settings.theme')}
              changed={(theme !== APPEARANCE_DEFAULTS.theme ? 1 : 0) + (colorMode !== APPEARANCE_DEFAULTS.colorMode ? 1 : 0)}
              reset={() => {
                const [previousTheme, previousMode] = [theme, colorMode];
                setTheme(APPEARANCE_DEFAULTS.theme);
                setColorMode(APPEARANCE_DEFAULTS.colorMode);
                return () => {
                  setTheme(previousTheme);
                  setColorMode(previousMode);
                };
              }}
            />
          </div>
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
          {availableLanguages.map((l) => {
            const isSelected = (appLanguage || 'de') === l.id;
            const percent = l.total ? Math.floor((l.translated / l.total) * 100) : 100;
            const sub = [
              l.english_name && l.english_name !== l.name ? l.english_name : '',
              percent < 100 ? t('settings.langTranslated', { percent }) : '',
              l.custom ? t('settings.langCustom') : l.downloaded ? t('settings.langDownloaded') : '',
            ].filter(Boolean).join(' · ');
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setAppLanguage(l.id)}
                aria-pressed={isSelected}
                lang={l.id}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500/80 bg-cyan-950/20 text-cyan-300 shadow-sm'
                    : 'border-slate-800 bg-app/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-slate-200">{l.name}</div>
                  {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
                </div>
                {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
              </button>
            );
          })}
        </div>

        {ownLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{t('settings.langOwnFiles')}:</span>
            {ownLanguages.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 py-0.5 pl-2.5 pr-1 text-slate-200">
                {l.name} <span className="text-slate-500">({l.id}.json)</span>
                <button
                  type="button"
                  onClick={() =>
                    void removeUiLanguage(l.id)
                      .then(() => toast.success(t('settings.langRemoved', { name: l.name })))
                      .catch((e) => toast.error(errorMessage(e)))
                  }
                  aria-label={t('settings.langRemove', { name: l.name })}
                  title={t('settings.langRemove', { name: l.name })}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <p className="max-w-xl">{t('settings.langAddOwnHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void importLanguage()}
              className="px-3 py-1.5 rounded-lg border border-cyan-700/70 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-200 flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('settings.langImport')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void api.openUiLocalesFolder().catch((e) => toast.error(t('settings.langFolderFailed', { error: errorMessage(e) })))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('settings.langAddOwn')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void refreshLanguages()
                  .then((list) => toast.success(t('settings.langReloaded', { count: list.length })))
                  .catch((e) => toast.error(errorMessage(e)))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('settings.langReload')}</span>
            </button>
          </div>
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
      <ProactiveSettings />

      <NsfwSettings />

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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h2 id="setting-avatars" className="text-sm font-semibold text-slate-200">{t('settings.avatarDefaults')}</h2>
        <button
          type="button"
          onClick={() => setActiveTab('avatars')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          data-open-avatar-manager
        >
          <UserRound className="h-3.5 w-3.5 text-accent-400" aria-hidden />
          {t('avatars.openManager')}
        </button>
      </div>
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
            {vrms.map((vrm, idx) => (
              <option key={idx} value={vrm.path}>
                {vrm.name} ({vrm.format === 'mmd' ? 'MMD, ' : vrm.format === 'gltf' ? 'glTF, ' : ''}{vrm.size_mb.toFixed(0)} MB)
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
        <AvatarActions
          key={`vrm:${selectedVrm?.path}:${justImported === selectedVrm?.path}`}
          startEditing={!!selectedVrm && justImported === selectedVrm.path}
          kind="vrm"
          entry={selectedVrm}
          refresh={refreshVrmModels}
          hide={(path) => hideAvatar('vrm', path)}
          unhide={(path) => unhideAvatar('vrm', path)}
        />
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
      <ModelFaceSettings />

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
            {live2ds.map((l2d, idx) => (
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
        <AvatarActions
          key={`live2d:${selectedLive2d?.model_path}:${justImported === selectedLive2d?.model_path}`}
          startEditing={!!selectedLive2d && justImported === selectedLive2d.model_path}
          kind="live2d"
          entry={selectedLive2d && { name: selectedLive2d.name, path: selectedLive2d.model_path, removable: selectedLive2d.removable }}
          refresh={refreshLive2dModels}
          hide={(path) => hideAvatar('live2d', path)}
          unhide={(path) => unhideAvatar('live2d', path)}
        />
      </div>
    </div>
  );
};
