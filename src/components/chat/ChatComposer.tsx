import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, FileText, Lightbulb, Loader2, Paperclip, PenLine, Send, Square, X } from 'lucide-react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { errorFix } from '../../utils/errorFixes';
import { streamingTts } from '../../services/streamingTts';
import { useTranslation } from '../../i18n';
import { VoiceCallControls } from '../voice/VoiceCallControls';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import type { ContextUsage } from '../../types';
import { readDraft, writeDraft } from '../../utils/drafts';
import { reportFailure } from '../../store/reportFailure';

/**
 * Message input with send/abort, voice controls and the context meter. Owns the draft so
 * typing doesn't re-render the chat view.
 */
export const ChatComposer: React.FC = () => {
  const { t } = useTranslation();
  const {
    sendMessage, suggestReplies, draftReply, isGenerating, abortGeneration, activeVoiceConfig, setAutoTtsEnabled, contextUsage,
    selectedBackend, serverConfig, generationFailure, retryGeneration, activeChatId, isChatLoading, chatLoadError, retryChatLoad,
  } = useStoreFields(
    'sendMessage', 'suggestReplies', 'draftReply', 'isGenerating', 'abortGeneration', 'activeVoiceConfig', 'setAutoTtsEnabled', 'contextUsage',
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
  // Direction mode: the next message is a note to the AI, sent as ((…)).
  const [directing, setDirecting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  // Reply ideas and drafts belong to the chat they were asked for; another chat shows none.
  const [ideas, setIdeas] = useState<{ key: string | null; items: string[] }>({ key: null, items: [] });
  const [helping, setHelping] = useState<{ key: string; kind: 'ideas' | 'draft' } | null>(null);
  const shownIdeas = ideas.key === draftKey ? ideas.items : [];
  const helpKind = helping?.key === draftKey ? helping.kind : null;
  const currentKey = useRef(draftKey);
  useEffect(() => {
    currentKey.current = draftKey;
  }, [draftKey]);

  /** Runs one request for help with the next message; the input is read-only meanwhile. */
  const helpWith = async (kind: 'ideas' | 'draft', run: (key: string, notes: string) => Promise<void>) => {
    const key = draftKey;
    if (!key) return;
    setHelping({ key, kind });
    try {
      await run(key, input);
    } catch (e) {
      reportFailure(kind === 'ideas' ? 'Reply ideas failed:' : 'Reply draft failed:', e);
    } finally {
      setHelping((current) => (current?.key === key ? null : current));
    }
  };

  const askForIdeas = () => helpWith('ideas', async (key, notes) => {
    const items = await suggestReplies(notes);
    setIdeas({ key, items });
  });

  const writeForMe = () => helpWith('draft', async (key, notes) => {
    const text = await draftReply(notes);
    if (currentKey.current !== key) {
      // The user moved on to another chat: keep the draft for this one.
      writeDraft(key, text);
      return;
    }
    setInput(text);
    setIdeas({ key: null, items: [] });
    textInput.current?.focus();
    if (notes.trim()) {
      toast.info(t('chat.draftWritten'), {
        label: t('common.undo'),
        onClick: () => {
          if (currentKey.current === key) setInput((current) => (current === text ? notes : current));
        },
      });
    }
  });

  const pickIdea = (idea: string) => {
    setInput(idea);
    setIdeas({ key: null, items: [] });
    textInput.current?.focus();
  };

  const addFiles = (list: Iterable<File>) => {
    const added = [...list];
    if (added.length > 0) setFiles((current) => [...current, ...added].slice(0, MAX_FILES));
  };

  const handleSend = () => {
    if ((!input.trim() && files.length === 0) || isGenerating || !activeChatId || isChatLoading || chatLoadError) return;
    streamingTts.cancel();
    const [text, attached] = [directing ? asDirection(input) : input, files];
    setInput('');
    setFiles([]);
    setIdeas({ key: null, items: [] });
    setDirecting(false);
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

  const failureFix = generationFailure ? errorFix(generationFailure.cause ?? generationFailure.message, useAppStore.getState()) : null;
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {failureFix && (
              <button type="button" onClick={failureFix.run} data-error-fix
                className="rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-100 hover:bg-rose-500/30">{t(failureFix.label)}</button>
            )}
            <button type="button" disabled={isGenerating} onClick={() => void retryGeneration()}
              className="underline disabled:opacity-40">{t('common.retry')}</button>
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="max-w-4xl mx-auto mb-2 flex flex-wrap gap-2" aria-label={t('chat.attachments')}>
          {files.map((file, i) => (
            <PendingFile key={`${file.name}-${i}`} file={file} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      {helpKind === 'draft' && (
        <p role="status" className="max-w-4xl mx-auto mb-2 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          {t('chat.draftLoading')}
        </p>
      )}
      {(helpKind === 'ideas' || shownIdeas.length > 0) && (
        <div className="max-w-4xl mx-auto mb-2 flex flex-wrap items-center gap-2" role="group" aria-label={t('chat.replyIdeasTitle')} data-reply-ideas>
          {helpKind === 'ideas' ? (
            <span role="status" className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              {t('chat.replyIdeasLoading')}
            </span>
          ) : (
            <>
              {shownIdeas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => pickIdea(idea)}
                  title={t('chat.replyIdeasUse')}
                  className="max-w-full rounded-xl border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-left text-sm text-slate-100 hover:bg-accent-500/20 transition-colors"
                >
                  {idea}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIdeas({ key: null, items: [] })}
                className="p-1 text-slate-400 hover:text-slate-200"
                aria-label={t('chat.replyIdeasClose')}
                title={t('chat.replyIdeasClose')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
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
        <button
          type="button"
          onClick={() => void askForIdeas()}
          disabled={!activeChatId || isChatLoading || !!chatLoadError || isGenerating || helpKind !== null}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors border border-slate-700/80"
          title={t('chat.replyIdeasHint')}
          aria-label={t('chat.replyIdeas')}
          data-reply-ideas-button
        >
          <Lightbulb className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void writeForMe()}
          disabled={!activeChatId || isChatLoading || !!chatLoadError || isGenerating || helpKind !== null}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors border border-slate-700/80"
          title={t('chat.writeForMeHint')}
          aria-label={t('chat.writeForMe')}
          data-write-for-me
        >
          <PenLine className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDirecting((on) => !on);
            textInput.current?.focus();
          }}
          aria-pressed={directing}
          className={`p-2.5 rounded-xl border transition-colors ${
            directing
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700/80 text-slate-300'
          }`}
          title={t('chat.directionHint')}
          aria-label={t('chat.directionLabel')}
          data-direction-toggle
        >
          <Clapperboard className="w-4 h-4" />
        </button>
        <textarea
          ref={textInput}
          value={input}
          readOnly={helpKind !== null}
          aria-busy={helpKind !== null}
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
          placeholder={t(directing ? 'chat.directionPlaceholder' : 'chat.inputPlaceholder')}
          title={t('chat.inputHint')}
          aria-label={t('chat.inputLabel')}
          className={`flex-1 bg-app/80 border ${directing ? 'border-amber-500/70 border-dashed' : 'border-slate-700/80'} rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 focus:ring-1 focus:ring-accent-500 resize-none max-h-32 transition-colors`}
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
            disabled={!activeChatId || isChatLoading || !!chatLoadError || (!input.trim() && files.length === 0)}
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

/** A direction to the AI as it is stored and sent: wrapped in ((…)) unless the user already did. */
export const asDirection = (text: string): string => {
  const trimmed = text.trim();
  return !trimmed || (trimmed.startsWith('((') && trimmed.endsWith('))')) ? trimmed : `((${trimmed}))`;
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
  const expertMode = useAppStore((s) => s.expertMode);
  const room = Math.max(1, usage.context_tokens - usage.reserve_tokens);
  const percent = Math.min(100, Math.round((usage.prompt_tokens / room) * 100));
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <div
      className="max-w-4xl mx-auto mt-1.5 flex items-center gap-2 text-xs text-slate-400"
      title={`${expertMode ? '' : `${t('chat.contextSimpleHint')} `}${t(usage.estimated ? 'chat.contextEstimated' : 'chat.context', {
        used: k(usage.prompt_tokens),
        total: k(usage.context_tokens),
      })}. ${t('chat.contextTitle', { reserve: k(usage.reserve_tokens) })}`}
    >
      <div className="h-1 w-16 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
        <div
          className={`h-full ${percent >= 90 ? 'bg-amber-500' : 'bg-accent-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span data-context-percent={percent}>
        {expertMode
          ? t(usage.estimated ? 'chat.contextEstimated' : 'chat.context', {
              used: k(usage.prompt_tokens),
              total: k(usage.context_tokens),
            })
          : t('chat.contextSimple', { percent })}
      </span>
      {usage.dropped_messages > 0 && (
        <span className="text-amber-400">
          {tPlural('chat.contextDropped', usage.dropped_messages)}
        </span>
      )}
    </div>
  );
};
