import React, { useState } from 'react';
import { Send, Square } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { streamingTts } from '../../services/streamingTts';
import { useTranslation } from '../../i18n';
import { VoiceCallControls } from '../voice/VoiceCallControls';
import type { ContextUsage } from '../../types';

/**
 * Message input with send/abort, voice controls and the context meter. Owns the draft so
 * typing doesn't re-render the chat view.
 */
export const ChatComposer: React.FC = () => {
  const { t } = useTranslation();
  const { sendMessage, isGenerating, abortGeneration, activeVoiceConfig, setAutoTtsEnabled, contextUsage } =
    useStoreFields(
      'sendMessage', 'isGenerating', 'abortGeneration', 'activeVoiceConfig', 'setAutoTtsEnabled', 'contextUsage',
    );
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    streamingTts.cancel();
    sendMessage(input);
    setInput('');
  };

  const handleAbort = async () => {
    streamingTts.cancel();
    await abortGeneration();
  };

  return (
    <div className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t('chat.inputPlaceholder')}
          aria-label={t('chat.inputLabel')}
          className="flex-1 bg-app/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 focus:ring-1 focus:ring-accent-500 resize-none max-h-32 transition-colors"
          rows={1}
        />

        {isGenerating ? (
          <button
            onClick={() => void handleAbort()}
            className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md flex items-center justify-center"
            title={t('chat.abort')}
            aria-label={t('chat.abort')}
          >
            <Square className="w-4 h-4 fill-white" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-md flex items-center justify-center"
            title={t('chat.send')}
            aria-label={t('chat.send')}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
        <VoiceCallControls
          config={activeVoiceConfig}
          isGenerating={isGenerating}
          onDraft={setInput}
          onSend={sendMessage}
          onAbort={abortGeneration}
          onEnsureAutoTts={() => setAutoTtsEnabled(true)}
        />
      </div>
      {contextUsage && <ContextMeter usage={contextUsage} />}
    </div>
  );
};

/** How full the context window was for the last reply and how many old messages were left out. */
const ContextMeter: React.FC<{ usage: ContextUsage }> = ({ usage }) => {
  const { t, tPlural } = useTranslation();
  const room = Math.max(1, usage.context_tokens - usage.reserve_tokens);
  const percent = Math.min(100, Math.round((usage.prompt_tokens / room) * 100));
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <div
      className="max-w-4xl mx-auto mt-1.5 flex items-center gap-2 text-xs text-slate-400"
      title={t('chat.contextTitle', { reserve: k(usage.reserve_tokens) })}
    >
      <div className="h-1 w-16 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
        <div
          className={`h-full ${percent >= 90 ? 'bg-amber-500' : 'bg-accent-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span>
        {t(usage.estimated ? 'chat.contextEstimated' : 'chat.context', {
          used: k(usage.prompt_tokens),
          total: k(usage.context_tokens),
        })}
      </span>
      {usage.dropped_messages > 0 && (
        <span className="text-amber-400">
          {tPlural('chat.contextDropped', usage.dropped_messages)}
        </span>
      )}
    </div>
  );
};
