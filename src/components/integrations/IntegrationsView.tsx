import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import {
  ImageGenConfig,
  BackupGroupSelection,
  DiscordBotConfig,
  WebServerConfig,
} from '../../types';
import {
  Smartphone,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Play,
  Square,
  Save,
  Shield,
  Trash2,
  Download,
  Gamepad2,
  Bot,
  Image as ImageIcon,
  Palette,
  Database,
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  Clock,
  Layers,
  Wand2,
} from 'lucide-react';

const DEFAULT_WEB_CONFIG: WebServerConfig = {
  enabled: false,
  port: 8088,
  host: '0.0.0.0',
  auth_token: '',
};

const DEFAULT_BOT_CONFIG: DiscordBotConfig = {
  enabled: false,
  bot_token: '',
  command_prefix: '!',
  allowed_channels: [],
  cooldown_secs: 2,
};

const DEFAULT_IMG_CONFIG: ImageGenConfig = {
  provider: 'automatic1111',
  api_url: 'http://127.0.0.1:7860',
  api_key: null,
  positive_prompt_prefix: '',
  negative_prompt: 'low quality, bad hands, blurry',
  width: 512,
  height: 768,
  steps: 28,
  cfg_scale: 7.0,
  sampler_name: 'Euler a',
  seed: -1,
};

export const IntegrationsView: React.FC = () => {
  const {
    // Phase 17 Store items
    backups,
    fetchBackups,
    createBackup,
    restoreBackup,
    deleteBackup,

    imageGenConfig,
    saveImageGenConfig,
    generateImageAction,
    generatedImages,
    fetchGeneratedImages,

    discordRpcEnabled,
    setDiscordRpcEnabled,
    discordBotConfig,
    discordBotStatus,
    saveDiscordBotConfig,
    startDiscordBot,
    stopDiscordBot,

    webServerConfig,
    webServerStatus,
    saveWebServerConfig,
    startWebServer,
    stopWebServer,
    regenerateWebServerToken,

    activeCharacter,
    currentEmotion,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'web' | 'discord' | 'image' | 'backup'>('web');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showImgApiKey, setShowImgApiKey] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Local loading states
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Local form states
  const [localWebConfig, setLocalWebConfig] = useState<WebServerConfig>(
    webServerConfig || DEFAULT_WEB_CONFIG
  );
  const [localBotConfig, setLocalBotConfig] = useState<DiscordBotConfig>(
    discordBotConfig || DEFAULT_BOT_CONFIG
  );
  const [localImgConfig, setLocalImgConfig] = useState<ImageGenConfig>(
    imageGenConfig || DEFAULT_IMG_CONFIG
  );

  // Backup form
  const [backupLabel, setBackupLabel] = useState('');
  const [backupGroups, setBackupGroups] = useState<BackupGroupSelection>({
    characters: true,
    lorebooks: true,
    personas: true,
    soul_memory: true,
    soul_stage: true,
    companion: true,
    settings: true,
  });

  // Image Gen test prompt
  const [testPrompt, setTestPrompt] = useState('');
  const [testNegative, setTestNegative] = useState(DEFAULT_IMG_CONFIG.negative_prompt);

  useEffect(() => {
    if (webServerConfig) setLocalWebConfig(webServerConfig);
  }, [webServerConfig]);

  useEffect(() => {
    if (discordBotConfig) setLocalBotConfig(discordBotConfig);
  }, [discordBotConfig]);

  useEffect(() => {
    if (imageGenConfig) {
      setLocalImgConfig(imageGenConfig);
      if (!testNegative && imageGenConfig.negative_prompt) {
        setTestNegative(imageGenConfig.negative_prompt);
      }
    }
  }, [imageGenConfig]);

  const handleCopyServerUrl = async () => {
    if (!webServerStatus?.connection_url) return;
    try {
      await navigator.clipboard.writeText(webServerStatus.connection_url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch (e) {
      console.error('Failed to copy URL:', e);
    }
  };

  const handleSaveWebConfig = async () => {
    try {
      await saveWebServerConfig(localWebConfig);
      setStatusNotice('Web-Server-Konfiguration gespeichert.');
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (e: any) {
      setStatusNotice(`Fehler: ${e?.message || e}`);
    }
  };

  const handleSaveBotConfig = async () => {
    try {
      await saveDiscordBotConfig(localBotConfig);
      setStatusNotice('Discord-Bot-Konfiguration gespeichert.');
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (e: any) {
      setStatusNotice(`Fehler: ${e?.message || e}`);
    }
  };

  const handleSaveImgConfig = async () => {
    try {
      await saveImageGenConfig(localImgConfig);
      setStatusNotice('Bildgenerierungs-Einstellungen gespeichert.');
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (e: any) {
      setStatusNotice(`Fehler: ${e?.message || e}`);
    }
  };

  const handleBuildPromptFromContext = async () => {
    if (!activeCharacter) {
      setStatusNotice('Kein aktiver Charakter ausgewählt.');
      setTimeout(() => setStatusNotice(null), 3000);
      return;
    }
    try {
      const p = await api.buildCharacterImagePrompt(
        activeCharacter.card.data.name,
        activeCharacter.card.data.description,
        currentEmotion?.emotion,
        'portrait, looking at viewer, masterpiece, anime style',
        testPrompt || undefined
      );
      setTestPrompt(p);
      setStatusNotice('Prompt aus Charakter & Emotion synthetisiert!');
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (e: any) {
      setStatusNotice(`Fehler: ${e?.message || e}`);
    }
  };

  const handleGenerateImage = async () => {
    if (!testPrompt.trim()) {
      setStatusNotice('Bitte gib einen Prompt ein.');
      setTimeout(() => setStatusNotice(null), 3000);
      return;
    }
    setIsGeneratingImage(true);
    try {
      const res = await generateImageAction(testPrompt, testNegative || undefined, localImgConfig);
      if (res) {
        setStatusNotice(`Bild erfolgreich generiert: ${res.file_name}!`);
      } else {
        setStatusNotice('Bildgenerierung abgeschlossen.');
      }
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (e: any) {
      setStatusNotice(`Bildgenerierung fehlgeschlagen: ${e?.message || e}`);
      setTimeout(() => setStatusNotice(null), 6000);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleCreateBackup = async () => {
    setIsBackupLoading(true);
    try {
      const entry = await createBackup(backupGroups, backupLabel || undefined);
      setBackupLabel('');
      setStatusNotice(`Backup erfolgreich erstellt: ${entry?.filename || 'ZIP Archiv'}`);
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (e: any) {
      setStatusNotice(`Backup-Fehler: ${e?.message || e}`);
      setTimeout(() => setStatusNotice(null), 5000);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (
      !window.confirm(
        `Möchtest du das Backup "${filename}" wirklich wiederherstellen? OtakuSoul erstellt automatisch vorab einen Sicherheits-Snapshot.`
      )
    ) {
      return;
    }
    try {
      const snap = await restoreBackup(filename);
      setStatusNotice(`Wiederherstellung erfolgreich! (Sicherheits-Snapshot: ${snap})`);
      setTimeout(() => setStatusNotice(null), 5000);
    } catch (e: any) {
      setStatusNotice(`Wiederherstellung fehlgeschlagen: ${e?.message || e}`);
      setTimeout(() => setStatusNotice(null), 6000);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Möchtest du das Backup "${filename}" unwiderruflich löschen?`)) {
      return;
    }
    try {
      await deleteBackup(filename);
      setStatusNotice(`Backup "${filename}" gelöscht.`);
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (e: any) {
      setStatusNotice(`Löschen fehlgeschlagen: ${e?.message || e}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">Ökosystem & Integrationen</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                Phase 17
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Mobiler Web-Client, Discord RPC & Bot, KI-Bildgenerierung und Profil-Backups
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('web')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'web'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobiler Web-Client</span>
            {webServerStatus?.is_running && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('discord')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
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
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'image'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Bildgenerierung</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'backup'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Profil-Backup</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 font-mono">
              {backups.length}
            </span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {statusNotice && (
        <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 text-cyan-200 text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
        {/* ========================================================================= */}
        {/* TAB 1: MOBILER WEB-CLIENT                                                  */}
        {/* ========================================================================= */}
        {activeTab === 'web' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Status & Connect */}
            <div className="lg:col-span-2 space-y-6">
              {/* Server Control Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                        webServerStatus?.is_running
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-100">Lokaler Axum Web-Server</h2>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                            webServerStatus?.is_running
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {webServerStatus?.is_running ? 'Aktiv / Läuft' : 'Gestoppt'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Chatte vom Smartphone, Tablet oder Laptop im selben WLAN ohne App-Installation
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {webServerStatus?.is_running ? (
                      <button
                        onClick={stopWebServer}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md shadow-rose-600/20 transition"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Server stoppen</span>
                      </button>
                    ) : (
                      <button
                        onClick={startWebServer}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Server starten</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Connection URL Box */}
                {webServerStatus?.is_running && webServerStatus.connection_url && (
                  <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-2">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                      Verbindungs-Adresse (WLAN)
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webServerStatus.connection_url}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-200 select-all"
                      />
                      <button
                        onClick={handleCopyServerUrl}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                      >
                        {copiedUrl ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedUrl ? 'Kopiert!' : 'Kopieren'}</span>
                      </button>
                      <a
                        href={webServerStatus.connection_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        title="Im Browser öffnen"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Settings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Port
                    </label>
                    <input
                      type="number"
                      value={localWebConfig.port}
                      onChange={(e) =>
                        setLocalWebConfig({ ...localWebConfig, port: parseInt(e.target.value) || 8088 })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Sicherheitstoken (Auth-Token)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={localWebConfig.auth_token}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono"
                      />
                      <button
                        onClick={regenerateWebServerToken}
                        title="Neues Token generieren"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="text-xs text-slate-400">
                    Host: <span className="font-mono text-slate-200">{localWebConfig.host}</span> (Lokales WLAN)
                  </div>

                  <button
                    onClick={handleSaveWebConfig}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Konfiguration speichern</span>
                  </button>
                </div>
              </div>

              {/* Security & Feature Info */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-3 text-xs text-slate-400">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Integrierter Rebinding-Schutz & Token-Authentifizierung</span>
                </div>
                <p className="leading-relaxed">
                  Der integrierte Axum Webserver prüft den HTTP Host-Header gegen DNS-Rebinding-Angriffe und verlangt bei jedem Zugriff ein kryptografisches Token. Der Web-Client läuft autark in jedem modernen mobilen Browser (iOS Safari, Android Chrome/Firefox) und bietet Echtzeit-Chat mit Streaming, Sprachausgabe (TTS) und STT-Upload.
                </p>
              </div>
            </div>

            {/* Right 1 Col: QR Code Widget */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                <QrCode className="w-4 h-4 text-cyan-400" />
                <span>Smartphone Schnellzugriff</span>
              </div>

              {webServerStatus?.is_running && webServerStatus.qr_code_svg ? (
                <div className="p-4 bg-white rounded-2xl shadow-xl border border-slate-700">
                  <div
                    className="w-48 h-48"
                    dangerouslySetInnerHTML={{ __html: webServerStatus.qr_code_svg }}
                  />
                </div>
              ) : (
                <div className="w-48 h-48 rounded-2xl bg-slate-950 border border-dashed border-slate-800 flex flex-col items-center justify-center p-4 text-slate-500">
                  <Smartphone className="w-8 h-8 mb-2 opacity-40" />
                  <span className="text-xs">Server gestoppt</span>
                  <span className="text-[10px] text-slate-600 mt-1">Starte den Server für den QR-Code</span>
                </div>
              )}

              <div className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Öffne die Kamera auf deinem Smartphone oder Tablet und scanne den QR-Code, um dich direkt mit OtakuSoul zu verbinden.
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DISCORD INTEGRATION                                                */}
        {/* ========================================================================= */}
        {activeTab === 'discord' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Col: Rich Presence (RPC) */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Discord Rich Presence (RPC)</h2>
                    <p className="text-xs text-slate-400">
                      Zeige deinen Freunden auf Discord deinen aktuellen Status
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={discordRpcEnabled}
                    onChange={(e) => setDiscordRpcEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Status Preview Card */}
              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold text-lg">
                    {activeCharacter?.card.data.name?.charAt(0) || 'O'}
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-slate-200">OtakuSoul</div>
                    <div className="text-indigo-300">
                      Spielt mit {activeCharacter?.card.data.name || 'einem Charakter'}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Emotion: {currentEmotion?.emotion || 'neutral'} · Im Chat
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 space-y-2">
                <p className="leading-relaxed">
                  Verbindet sich nativ über den lokalen Discord IPC Socket (<code className="font-mono text-[11px] text-slate-300">/run/user/$UID/discord-ipc-0</code> bzw. Windows Named Pipe). Kein externer Bot-Account für Rich Presence erforderlich.
                </p>
              </div>
            </div>

            {/* Right Col: Discord Gateway Bot */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-100">Discord Gateway Bot</h2>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          discordBotStatus?.is_running
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {discordBotStatus?.is_running ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Bringe deine Charaktere direkt auf deinen Discord-Server
                    </p>
                  </div>
                </div>

                <div>
                  {discordBotStatus?.is_running ? (
                    <button
                      onClick={stopDiscordBot}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow transition"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stoppen</span>
                    </button>
                  ) : (
                    <button
                      onClick={startDiscordBot}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium shadow transition"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Bot starten</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Bot Config */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Discord Bot Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showBotToken ? 'text' : 'password'}
                      value={localBotConfig.bot_token}
                      onChange={(e) =>
                        setLocalBotConfig({ ...localBotConfig, bot_token: e.target.value })
                      }
                      placeholder="MTAx..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBotToken(!showBotToken)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Befehls-Präfix
                    </label>
                    <input
                      type="text"
                      value={localBotConfig.command_prefix}
                      onChange={(e) =>
                        setLocalBotConfig({ ...localBotConfig, command_prefix: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Cooldown (Sekunden)
                    </label>
                    <input
                      type="number"
                      value={localBotConfig.cooldown_secs}
                      onChange={(e) =>
                        setLocalBotConfig({ ...localBotConfig, cooldown_secs: parseInt(e.target.value) || 2 })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveBotConfig}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Bot-Konfiguration speichern</span>
                  </button>
                </div>
              </div>

              {/* Bot Command Cheatsheet */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                <span className="font-bold text-slate-300 block mb-1">Verfügbare Befehle:</span>
                <div className="font-mono text-[11px] text-purple-300 space-y-1">
                  <div><span className="text-slate-200">!ask &lt;Text&gt;</span> – Chatte mit dem aktuellen Charakter</div>
                  <div><span className="text-slate-200">!character &lt;Name&gt;</span> – Wechselt den aktiven Charakter</div>
                  <div><span className="text-slate-200">!status</span> – Zeigt aktuellen Charakter & Emotion</div>
                  <div><span className="text-slate-200">!reset</span> – Setzt die Konversation zurück</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: KI-BILDGENERIERUNG                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'image' && (
          <div className="space-y-6">
            {/* Top Configuration & Studio */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider Config */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                      <Palette className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-100">KI-Bildgenerator Konfiguration</h2>
                      <p className="text-xs text-slate-400">
                        Automatic1111, ComfyUI, DALL-E 3, NovelAI & FLUX
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveImgConfig}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Speichern</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Provider
                    </label>
                    <select
                      value={localImgConfig.provider}
                      onChange={(e) =>
                        setLocalImgConfig({
                          ...localImgConfig,
                          provider: e.target.value,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="automatic1111">Automatic1111 (SD WebUI)</option>
                      <option value="comfy_ui">ComfyUI</option>
                      <option value="dall_e_3">OpenAI DALL-E 3</option>
                      <option value="novel_ai">NovelAI Image Gen</option>
                      <option value="flux">FLUX</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Auflösung
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={localImgConfig.width}
                        onChange={(e) =>
                          setLocalImgConfig({
                            ...localImgConfig,
                            width: parseInt(e.target.value) || 512,
                          })
                        }
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100 font-mono text-center"
                        placeholder="Breite"
                      />
                      <input
                        type="number"
                        value={localImgConfig.height}
                        onChange={(e) =>
                          setLocalImgConfig({
                            ...localImgConfig,
                            height: parseInt(e.target.value) || 768,
                          })
                        }
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100 font-mono text-center"
                        placeholder="Höhe"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    API-Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={localImgConfig.api_url}
                    onChange={(e) =>
                      setLocalImgConfig({ ...localImgConfig, api_url: e.target.value })
                    }
                    placeholder="http://127.0.0.1:7860"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    API-Key (falls erforderlich)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showImgApiKey ? 'text' : 'password'}
                      value={localImgConfig.api_key || ''}
                      onChange={(e) =>
                        setLocalImgConfig({
                          ...localImgConfig,
                          api_key: e.target.value || undefined,
                        })
                      }
                      placeholder="sk-..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowImgApiKey(!showImgApiKey)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      {showImgApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Steps ({localImgConfig.steps})
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      value={localImgConfig.steps}
                      onChange={(e) =>
                        setLocalImgConfig({
                          ...localImgConfig,
                          steps: parseInt(e.target.value) || 28,
                        })
                      }
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CFG Scale ({localImgConfig.cfg_scale})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={0.5}
                      value={localImgConfig.cfg_scale}
                      onChange={(e) =>
                        setLocalImgConfig({
                          ...localImgConfig,
                          cfg_scale: parseFloat(e.target.value) || 7.0,
                        })
                      }
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Live Generator Studio */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <h2 className="text-sm font-bold text-slate-100">Live-Synthesizer Studio</h2>
                  </div>

                  <button
                    onClick={handleBuildPromptFromContext}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs border border-purple-500/40 transition"
                    title="Baut einen Bild-Prompt aus dem aktuellen Charakter & Emotion"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Prompt aus Charakter</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Positiver Prompt
                  </label>
                  <textarea
                    rows={4}
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="1girl, anime masterpiece, silver hair, cyber jacket, smiling..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-purple-500 resize-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Negativer Prompt
                  </label>
                  <textarea
                    rows={2}
                    value={testNegative}
                    onChange={(e) => setTestNegative(e.target.value)}
                    placeholder="low quality, bad hands, blurry..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500 resize-none font-mono"
                  />
                </div>

                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || !testPrompt.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition"
                >
                  {isGeneratingImage ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Generiere Bild...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4" />
                      <span>Bild jetzt generieren</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Bottom Gallery Feed */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    Generierte Bilder-Galerie ({generatedImages.length})
                  </h3>
                </div>

                <button
                  onClick={fetchGeneratedImages}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  title="Galerie aktualisieren"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {generatedImages.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Noch keine Bilder generiert. Nutze das Studio oben, um dein erstes Charakterbild zu rendern!
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {generatedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="group relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col p-3 space-y-2"
                    >
                      <div className="w-full aspect-[2/3] bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800">
                        <ImageIcon className="w-8 h-8 text-purple-400 opacity-60" />
                      </div>
                      <div className="text-[11px] font-mono text-slate-200 truncate">
                        {img.file_name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {(img.size_bytes / 1024).toFixed(1)} KB · {img.created_at}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PROFIL-BACKUP & WIEDERHERSTELLUNG                                   */}
        {/* ========================================================================= */}
        {activeTab === 'backup' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Backup Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">Neues Backup erstellen</h2>
                  <p className="text-xs text-slate-400">
                    Sichere deine Daten in ein portables ZIP-Archiv
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Backup-Name / Notiz (optional)
                </label>
                <input
                  type="text"
                  value={backupLabel}
                  onChange={(e) => setBackupLabel(e.target.value)}
                  placeholder="z. B. Vor Update, Cyberpunk Stage Setup..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-300">
                  Zu sichernde Bereiche:
                </span>
                {[
                  { key: 'characters', label: '🎭 Charaktere' },
                  { key: 'lorebooks', label: '📜 Lorebooks' },
                  { key: 'personas', label: '👤 User-Personas' },
                  { key: 'soul_memory', label: '🧠 Seelen-Gedächtnis & Psychologie' },
                  { key: 'soul_stage', label: '⚔️ Soul Stage Kampagnen & Szenarien' },
                  { key: 'companion', label: '🤖 Desktop-Companion & Plugins' },
                  { key: 'settings', label: '⚙️ App-Einstellungen' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={(backupGroups as any)[item.key]}
                      onChange={(e) =>
                        setBackupGroups({ ...backupGroups, [item.key]: e.target.checked })
                      }
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={handleCreateBackup}
                disabled={isBackupLoading}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {isBackupLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Erstelle ZIP-Backup...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Backup jetzt anlegen</span>
                  </>
                )}
              </button>

              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 leading-relaxed">
                🛡️ <strong>Schutzgarantie:</strong> Vor jeder Wiederherstellung wird automatisch ein präventiver Snapshot angelegt. Es werden stets bis zu 5 Sicherheits-Snapshots aufbewahrt.
              </div>
            </div>

            {/* List Existing Backups */}
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    Vorhandene Sicherungen ({backups.length})
                  </h3>
                </div>

                <button
                  onClick={fetchBackups}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  title="Liste aktualisieren"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Keine Backups gefunden. Lege links deine erste Sicherung an!
                </div>
              ) : (
                <div className="space-y-3">
                  {backups.map((b) => {
                    const isSafety = b.is_safety_snapshot;
                    const sizeMb = (b.size_bytes / (1024 * 1024)).toFixed(2);
                    return (
                      <div
                        key={b.filename}
                        className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition ${
                          isSafety
                            ? 'bg-amber-950/20 border-amber-500/30'
                            : 'bg-slate-950 border-slate-800/80'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-200">
                              {b.filename}
                            </span>
                            {isSafety ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                <span>Sicherheits-Snapshot</span>
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Manuelles Backup
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {b.created_at}
                            </span>
                            <span>{sizeMb} MB</span>
                            {b.manifest && (
                              <span className="text-slate-500">
                                Version {b.manifest.app_version}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRestoreBackup(b.filename)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/40 transition"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Wiederherstellen</span>
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b.filename)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                            title="Backup löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
