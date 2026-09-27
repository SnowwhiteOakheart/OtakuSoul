import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { translate, useTranslation } from '../../i18n';
import {
  X,
  RefreshCw,
  Trash2,
  Download,
  Search,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { confirmDialog } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';

export const LogViewerModal: React.FC = () => {
  const { isLogViewerOpen, setIsLogViewerOpen, logs, fetchLogs, clearLogs, exportLogs } =
    useAppStore();
  const { t } = useTranslation();

  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'>(
    'ALL'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLogViewerOpen) {
      handleRefresh();
    }
  }, [isLogViewerOpen]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!isLogViewerOpen) return null;

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchLogs(300);
    setIsLoading(false);
  };

  const handleClear = async () => {
    const confirmed = await confirmDialog({
      title: translate('confirm.clearLogsTitle'),
      message: translate('confirm.clearLogsText'),
      confirmLabel: translate('logger.clear'),
      tone: 'danger',
    });
    if (confirmed) await clearLogs();
  };

  const handleExport = async () => {
    try {
      const content = await exportLogs();
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `otakusoul-log-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleCopy = async () => {
    try {
      const content = await exportLogs();
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = levelFilter === 'ALL' || log.level.toUpperCase() === levelFilter;
    const matchesSearch =
      searchTerm === '' ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.timestamp.includes(searchTerm);
    return matchesLevel && matchesSearch;
  });

  return (
    <ModalOverlay onClose={() => setIsLogViewerOpen(false)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shadow-md">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">{t('logger.title')}</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {logs.length} Einträge
                </span>
              </div>
              <p className="text-xs text-slate-400">{t('logger.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={t('common.refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={t('common.copy')}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={t('logger.export')}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition"
              title={t('logger.clear')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsLogViewerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="px-6 py-3 bg-app/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          {/* Level Filter Chips */}
          <div className="flex items-center gap-1.5">
            {(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
                  levelFilter === lvl
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Search & AutoScroll */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('logger.searchPlaceholder')}
                className="bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48 sm:w-64 font-sans"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
              />
              <span>Auto-Scroll</span>
            </label>
          </div>
        </div>

        {/* Console Log Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-app font-mono text-[11px] leading-relaxed select-text space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-slate-600">{t('logger.noLogs')}</div>
          ) : (
            filteredLogs.map((log, idx) => {
              const isError = log.level.toUpperCase() === 'ERROR';
              const isWarn = log.level.toUpperCase() === 'WARN';
              const isInfo = log.level.toUpperCase() === 'INFO';

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2 py-0.5 px-2 rounded hover:bg-slate-900/60 transition ${
                    isError
                      ? 'bg-rose-950/20 text-rose-300'
                      : isWarn
                      ? 'bg-amber-950/20 text-amber-300'
                      : isInfo
                      ? 'text-slate-300'
                      : 'text-slate-400'
                  }`}
                >
                  <span className="text-slate-600 select-none shrink-0">{log.timestamp}</span>

                  <span
                    className={`font-bold shrink-0 px-1 rounded text-[10px] ${
                      isError
                        ? 'bg-rose-500/20 text-rose-400'
                        : isWarn
                        ? 'bg-amber-500/20 text-amber-400'
                        : isInfo
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {log.level.padEnd(5, ' ')}
                  </span>

                  <span className="text-indigo-400 shrink-0 font-medium">[{log.target}]</span>

                  <span className="flex-1 break-all whitespace-pre-wrap">{log.message}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </ModalOverlay>
  );
};
