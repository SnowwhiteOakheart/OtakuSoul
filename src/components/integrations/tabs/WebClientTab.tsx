import type React from 'react';
import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
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
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type { WebServerConfig } from '../../../types';

const DEFAULT_WEB_CONFIG: WebServerConfig = {
  enabled: false,
  port: 8088,
  host: '0.0.0.0',
  auth_token: '',
};

export const WebClientTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    webServerConfig, webServerStatus, saveWebServerConfig, startWebServer, stopWebServer,
    regenerateWebServerToken,
  } = useStoreFields(
    'webServerConfig', 'webServerStatus', 'saveWebServerConfig', 'startWebServer', 'stopWebServer',
    'regenerateWebServerToken',
  );

  const [copiedUrl, setCopiedUrl] = useState(false);
  // Edits live in a draft; without one the form shows the saved configuration.
  const [draft, setLocalWebConfig] = useState<WebServerConfig | null>(null);
  const localWebConfig = draft ?? webServerConfig ?? DEFAULT_WEB_CONFIG;

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
      setLocalWebConfig(null);
      toast.success(t('int.webSaved'));
    } catch (e) {
      toast.error(t('int.error', { error: errorMessage(e) }));
    }
  };

  return (
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
                  <h2 className="text-sm font-bold text-slate-100">{t('int.webTitle')}</h2>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                      webServerStatus?.is_running
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {webServerStatus?.is_running ? t('int.running') : t('int.stopped')}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {t('int.webIntro')}
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
                  <span>{t('int.stopServer')}</span>
                </button>
              ) : (
                <button
                  onClick={startWebServer}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('int.startServer')}</span>
                </button>
              )}
            </div>
          </div>

          {webServerStatus?.is_running && localWebConfig.host !== '127.0.0.1' && localWebConfig.host !== 'localhost' && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {t('int.webWarning')}
              </p>
            </div>
          )}

          {/* Connection URL Box */}
          {webServerStatus?.is_running && webServerStatus.connection_url && (
            <div className="bg-app border border-cyan-500/30 rounded-xl p-4 space-y-2">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                {t('int.connectionUrl')}
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
                  title={t('int.openBrowser')}
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
                {t('int.port')}
              </label>
              <input
                type="number"
                value={localWebConfig.port}
                onChange={(e) =>
                  setLocalWebConfig({ ...localWebConfig, port: parseInt(e.target.value) || 8088 })
                }
                className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('int.authToken')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={localWebConfig.auth_token}
                  className="flex-1 bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono"
                />
                <button
                  onClick={regenerateWebServerToken}
                  title={t('int.newToken')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="text-xs text-slate-400">
              {t('int.host')} <span className="font-mono text-slate-200">{localWebConfig.host}</span> {t('int.localWifi')}
            </div>

            <button
              onClick={handleSaveWebConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('int.saveConfig')}</span>
            </button>
          </div>
        </div>

        {/* Security & Feature Info */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>{t('int.tokenTitle')}</span>
          </div>
          <p className="leading-relaxed">
            {t('int.tokenText')}
          </p>
        </div>
      </div>

      {/* Right 1 Col: QR Code Widget */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
        <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
          <QrCode className="w-4 h-4 text-cyan-400" />
          <span>{t('int.qrTitle')}</span>
        </div>

        {webServerStatus?.is_running && webServerStatus.qr_code_svg ? (
          <div className="p-4 bg-white rounded-2xl shadow-xl border border-slate-700">
            <div
              className="w-48 h-48"
              dangerouslySetInnerHTML={{ __html: webServerStatus.qr_code_svg }}
            />
          </div>
        ) : (
          <div className="w-48 h-48 rounded-2xl bg-app border border-dashed border-slate-800 flex flex-col items-center justify-center p-4 text-slate-400">
            <Smartphone className="w-8 h-8 mb-2 opacity-40" />
            <span className="text-xs">{t('int.serverStopped')}</span>
            <span className="text-[11px] text-slate-600 mt-1">{t('int.qrHint')}</span>
          </div>
        )}

        <div className="text-xs text-slate-400 leading-relaxed max-w-xs">
          {t('int.qrText')}
        </div>
      </div>
    </div>
  );
};
