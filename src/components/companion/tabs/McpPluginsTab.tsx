import type React from 'react';
import { useAppStore, useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Terminal,
  Layers,
} from 'lucide-react';

export const McpPluginsTab: React.FC = () => {
  const { t } = useTranslation();
  const appPaths = useAppStore((s) => s.appPaths);
  const {
    mcpServers, toggleMcpServer, companionPlugins,
  } = useStoreFields(
    'mcpServers', 'toggleMcpServer', 'companionPlugins',
  );

  return (
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
            <div className="p-8 text-center text-xs text-slate-400 italic">
              {t('comp.noPlugins')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
