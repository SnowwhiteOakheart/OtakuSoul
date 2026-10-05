import { useEffect, useState } from 'react';
import { Copy, Loader2, X } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { ModalOverlay } from '../ui/ModalOverlay';
import { toast } from '../ui/feedback';
import type { PromptLog } from '../../types';

/** Plain text of the whole prompt, for copying into a bug report or another tool. */
const asText = (log: PromptLog) =>
  log.messages
    .map((m) => `### ${m.role}${m.attachments.length ? ` [${m.attachments.join(', ')}]` : ''}\n${m.content}`)
    .join('\n\n');

/**
 * The prompt the chat model got last – after lorebooks, prompt template, author's note and
 * context trimming –, to see why a character answers the way it does.
 */
export const PromptLogModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [log, setLog] = useState<PromptLog | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let subscribed = true;
    api
      .getLastPrompt()
      .then((result) => subscribed && setLog(result ?? null))
      .catch((e) => subscribed && setError(errorMessage(e)));
    return () => {
      subscribed = false;
    };
  }, []);

  const copy = async () => {
    if (!log) return;
    try {
      await navigator.clipboard.writeText(asText(log));
      toast.success(t('promptLog.copied'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="prompt-log-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="prompt-log-title" className="text-lg font-semibold text-slate-100">{t('promptLog.title')}</h2>
            {log && (
              <p className="text-xs text-slate-400 mt-0.5 break-all">
                {new Date(log.at * 1000).toLocaleString()} · {log.model || t('promptLog.noModel')} · {log.endpoint_url}
                {log.context &&
                  ` · ${t('promptLog.tokens', { prompt: log.context.prompt_tokens, context: log.context.context_tokens, dropped: log.context.dropped_messages })}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!log}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('promptLog.copy')}
            </button>
            <button type="button" onClick={onClose} title={t('common.close')} aria-label={t('common.close')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3 select-text">
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          {log === undefined && !error && <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label={t('promptLog.loading')} />}
          {log === null && <p className="text-sm text-slate-400">{t('promptLog.empty')}</p>}
          {log?.messages.map((message, index) => (
            <section key={index} className="rounded-lg border border-slate-800 bg-app/60">
              <h3 className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono uppercase tracking-wider text-accent-300">
                {message.role}
                {message.attachments.length > 0 && <span className="ml-2 normal-case text-slate-400">{message.attachments.join(', ')}</span>}
              </h3>
              <pre className="px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words font-mono">{message.content}</pre>
            </section>
          ))}
          {log?.sampling && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">{t('promptLog.sampling')}</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono">{log.sampling}</pre>
            </details>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
