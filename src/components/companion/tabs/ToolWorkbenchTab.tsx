import React, { useState, useEffect } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Shield,
  Clock,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import type { JsonObject } from '../../../types';

export const ToolWorkbenchTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    companionState, requestToolCall, updateCompanionSettings, environmentSnapshot,
    fetchEnvironmentSnapshot, detectDesktopWindow,
  } = useStoreFields(
    'companionState', 'requestToolCall', 'updateCompanionSettings', 'environmentSnapshot',
    'fetchEnvironmentSnapshot', 'detectDesktopWindow',
  );

  const [selectedTool, setSelectedTool] = useState<string>('web_search');
  const [toolArgPrimary, setToolArgPrimary] = useState<string>('OtakuSoul Three.js VRM LipSync');
  const [toolArgSecondary, setToolArgSecondary] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<'powershell' | 'bash' | 'cmd' | 'python'>('powershell');
  const [detectedWindowTitle, setDetectedWindowTitle] = useState<string | null>(null);

  // The foreground window is only needed here, so it is polled only while this tab is open.
  useEffect(() => {
    const detect = () =>
      detectDesktopWindow().then((title) => {
        if (title) setDetectedWindowTitle(title);
      });
    void detect();
    const interval = setInterval(detect, 10000);
    return () => clearInterval(interval);
  }, [detectDesktopWindow]);

  const currentWindowTitle = detectedWindowTitle ?? companionState?.active_window_title ?? 'Desktop';
  const settings = companionState?.settings;
  const history = companionState?.tool_history || [];

  const handleRunTool = async (e: React.FormEvent) => {
    e.preventDefault();
    let args: JsonObject = {};

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

  return (
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
                  {t('comp.diskOf', { total: environmentSnapshot.disk_total_gb.toFixed(1) })}
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
  );
};
