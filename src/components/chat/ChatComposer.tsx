import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Paperclip, Send, Square, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { streamingTts } from '../../services/streamingTts';
import { useTranslation } from '../../i18n';
import { VoiceCallControls } from '../voice/VoiceCallControls';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import type { ContextUsage } from '../../types';
import { readDraft, writeDraft } from '../../utils/drafts';

/**
 * Message input with send/abort, voice controls and the context meter. Owns the draft so
 * typing doesn't re-render the chat view.
 */
export const ChatComposer: React.FC = () => {
  const { t } = useTranslation();
  const {
    sendMessage, isGenerating, abortGeneration, activeVoiceConfig, setAutoTtsEnabled, contextUsage,
    selectedBackend, serverConfig, generationFailure, retryGeneration, activeChatId, isChatLoading, chatLoadError, retryChatLoad,
  } = useStoreFields(
    'sendMessage', 'isGenerating', 'abortGeneration', 'activeVoiceConfig', 'setAutoTtsEnabled', 'contextUsage',
    'selectedBackend', 'serverConfig', 'generationFailure', 'retryGeneration', 'activeChatId', 'isChatLoading', 'chatLoadError', 'retryChatLoad',
  );
  // The text of each chat survives switching chats and restarts (files don't).
  const draftKey = activeChatId ? `composer:${activeChatId}` : null;
  const [input, setInput] = useState(() => (draftKey ? readDraft(draftKey) ?? '' : ''));
  const [shownKey, setShownKey] = useState(draftKey);
  if (shownKey !== draftKey) {
    // Another chat: show its draft; text typed before any chat was open moves along.
    setShownKey(draftKey);
    const stored = draftKey ? readDraft(draftKey) : null;
    if (stored !== null || shownKey !== null) setInput(stored ?? '');
  }
  useEffect(() => {
    if (shownKey) writeDraft(shownKey, input);
  }, [shownKey, input]);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: Iterable<File>) => {
    const added = [...list];
    if (added.length > 0) setFiles((current) => [...current, ...added].slice(0, MAX_FILES));
  };

  const handleSend = () => {
    if ((!input.trim() && files.length === 0) || isGenerating || isChatLoading || chatLoadError) return;
    streamingTts.cancel();
    const [text, attached] = [input, files];
    setInput('');
    setFiles([]);
    sendMessage(text, attached).catch((e) => {
      // Upload/user-write failure: restore the unsaved draft without discarding new typing.
      toast.error(errorMessage(e));
      setInput((current) => current ? `${text}\n${current}` : text);
      setFiles((current) => [...attached, ...current]);
    });
  };

  const imagesWithoutVision =
    selectedBackend === 'local' && !serverConfig.mmproj_path && files.some((f) => f.type.startsWith('image/'));

  const handleAbort = async () => {
    streamingTts.cancel();
    try { await abortGeneration(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
      {isChatLoading && <p role="status" className="max-w-4xl mx-auto mb-2 text-sm text-slate-300">{t('chat.historyLoading')}</p>}
      {chatLoadError && (
        <div role="alert" className="max-w-4xl mx-auto mb-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">
          <p>{t('chat.historyLoadError', { error: chatLoadError })}</p>
          <button type="button" disabled={isChatLoading} onClick={() => void retryChatLoad()}
            className="mt-2 underline disabled:opacity-40">{t('common.retry')}</button>
        </div>
      )}
      {generationFailure?.chatId === activeChatId && (
        <div role="alert" className="max-w-4xl mx-auto mb-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">
          <p>{t('chat.inferenceError', { error: generationFailure.message })}</p>
          <button type="button" disabled={isGenerating} onClick={() => void retryGeneration()}
            className="mt-2 underline disabled:opacity-40">{t('common.retry')}</button>
        </div>
      )}
      {files.length > 0 && (
        <div className="max-w-4xl mx-auto mb-2 flex flex-wrap gap-2" aria-label={t('chat.attachments')}>
          {files.map((file, i) => (
            <PendingFile key={`${file.name}-${i}`} file={file} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      {imagesWithoutVision && (
        <p className="max-w-4xl mx-auto mb-2 text-xs text-amber-300">{t('chat.noVisionHint')}</p>
      )}
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files ?? []);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={files.length >= MAX_FILES}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors border border-slate-700/80"
          title={t('chat.attachHint')}
          aria-label={t('chat.attach')}
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            // Screenshots and copied images from the clipboard become attachments.
            const pasted = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
            if (pasted.length > 0) {
              e.preventDefault();
              addFiles(pasted);
            }
          }}
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
            disabled={isChatLoading || !!chatLoadError || (!input.trim() && files.length === 0)}
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

const MAX_FILES = 6;
const ACCEPT = 'image/png,image/jpeg,image/webp,.pdf,.txt,.md,.json,.csv,.log,.xml,.html,.yaml,.yml';

/** A file waiting to be sent: thumbnail for images, name for documents. */
const PendingFile: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const { t } = useTranslation();
  const preview = useMemo(() => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 pl-1 pr-2 py-1 text-xs text-slate-300 max-w-56">
      {preview ? (
        <img src={preview} alt="" className="w-8 h-8 rounded object-cover" />
      ) : (
        <FileText className="w-4 h-4 ml-1 text-accent-400 shrink-0" />
      )}
      <span className="truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-slate-400 hover:text-rose-400"
        aria-label={t('chat.removeAttachment', { name: file.name })}
      >
        <X className="w-3.5 h-3.5" />
      </button>
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
