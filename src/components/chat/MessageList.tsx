import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FastForward,
  FileText,
  Languages,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translate, useTranslation } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import { PersonaAvatar } from '../characters/PersonaAvatar';
import { RoleplayMessage } from './RoleplayMessage';
import { api } from '../../services/api';
import type { Attachment, StoredChatMessage, UserPersona } from '../../types';

const BUBBLE_ACTION =
  'p-1 hover:text-accent-300 disabled:opacity-40 transition-colors flex items-center gap-1 rounded outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

interface MessageListProps {
  messages: StoredChatMessage[];
  /** The element that scrolls the chat; the list renders only what is visible in it. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  characterName: string;
  persona: UserPersona;
  isGenerating: boolean;
  /** Read a message aloud; undefined when no voice is set up. */
  onSpeak?: (text: string) => void;
}

/**
 * The chat history, virtualized: long chats (hundreds of messages) only keep the visible
 * messages in the DOM. Memoized so typing and streaming tokens don't re-render the history.
 */
export const MessageList = React.memo<MessageListProps>(
  ({ messages, scrollRef, characterName, persona, isGenerating, onSpeak }) => {
    // The app doesn't use the React Compiler; useVirtualizer's changing functions are fine here.
    // oxlint-disable-next-line react/incompatible-library
    const virtualizer = useVirtualizer({
      count: messages.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 140,
      overscan: 6,
      getItemKey: (index) => messages[index]?.id ?? index,
    });

    // Follow the conversation: jump to the newest message when one arrives or a chat opens.
    // Heights are estimates until measured, so the jump is repeated until the bottom holds
    // (timers, not animation frames: those pause while the window is hidden).
    const lastId = messages[messages.length - 1]?.id;
    useEffect(() => {
      if (messages.length === 0) return;
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stick = () => {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        const el = scrollRef.current;
        const gap = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
        if (gap > 2 && attempts++ < 20) timer = setTimeout(stick, 30);
      };
      stick();
      return () => clearTimeout(timer);
    }, [lastId, messages.length, virtualizer, scrollRef]);

    // Stay at the bottom while content grows (a translation opens, an image loads), but only
    // when the reader was already there.
    const pinned = useRef(true);
    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const onScroll = () => {
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      };
      el.addEventListener('scroll', onScroll, { passive: true });
      return () => el.removeEventListener('scroll', onScroll);
    }, [scrollRef]);
    const totalSize = virtualizer.getTotalSize();
    useEffect(() => {
      const el = scrollRef.current;
      if (el && pinned.current) el.scrollTop = el.scrollHeight;
    }, [totalSize, scrollRef]);

    if (messages.length === 0) return null;
    return (
      <div className="relative w-full" style={{ height: totalSize }}>
        {virtualizer.getVirtualItems().map((item) => {
          const msg = messages[item.index];
          if (!msg) return null;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              // Hover actions hang below the bubble; keep them above the next message.
              className="absolute left-0 top-0 w-full pb-4 hover:z-10 focus-within:z-10"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <ChatMessageItem
                msg={msg}
                characterName={characterName}
                persona={persona}
                isGenerating={isGenerating}
                onSpeak={onSpeak}
              />
            </div>
          );
        })}
      </div>
    );
  },
);
MessageList.displayName = 'MessageList';

interface ChatMessageItemProps {
  msg: StoredChatMessage;
  characterName: string;
  persona: UserPersona;
  isGenerating: boolean;
  onSpeak?: (text: string) => void;
}

const ChatMessageItem = React.memo<ChatMessageItemProps>(
  ({ msg, characterName, persona, isGenerating, onSpeak }) => {
    const { t } = useTranslation();
    const switchMessageSwipe = useAppStore((s) => s.switchMessageSwipe);
    const regenerateMessageSwipe = useAppStore((s) => s.regenerateMessageSwipe);
    const continueChatMessage = useAppStore((s) => s.continueChatMessage);
    const editChatMessage = useAppStore((s) => s.editChatMessage);
    const deleteChatMessage = useAppStore((s) => s.deleteChatMessage);
    const translateText = useAppStore((s) => s.translateText);
    const appLanguage = useAppStore((s) => s.appLanguage);

    const [thoughtOpen, setThoughtOpen] = useState(false);
    const [editContent, setEditContent] = useState<string | null>(null);
    const translationKey = `${appLanguage}\u0000${msg.content}`;
    const [translation, setTranslation] = useState<string | null>(() => translations.get(translationKey) ?? null);
    const [translating, setTranslating] = useState(false);
    // A cached translation belongs to this text and language only.
    const shownTranslation = translation !== null && translations.get(translationKey) === translation ? translation : null;

    const toggleTranslation = async () => {
      if (shownTranslation !== null) {
        setTranslation(null);
        return;
      }
      const cached = translations.get(translationKey);
      if (cached) {
        setTranslation(cached);
        return;
      }
      setTranslating(true);
      try {
        const text = await translateText(msg.content);
        translations.set(translationKey, text);
        setTranslation(text);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setTranslating(false);
      }
    };

    const isUser = msg.role === 'user';
    const isAssistant = msg.role === 'assistant';
    const hasMultipleSwipes = isAssistant && msg.swipes && msg.swipes.length > 1;

    const saveEdit = async () => {
      if (editContent?.trim()) await editChatMessage(msg.id, editContent.trim());
      setEditContent(null);
    };

    const remove = async () => {
      const confirmed = await confirmDialog({
        title: translate('confirm.deleteMessageTitle'),
        message: translate('confirm.deleteMessageText'),
        confirmLabel: translate('common.delete'),
        tone: 'danger',
      });
      if (confirmed) deleteChatMessage(msg.id);
    };

    return (
      <div className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Sender Header + Swipes Navigation */}
        <div className="flex items-center gap-2 mb-1 px-1">
          {isUser && <PersonaAvatar persona={persona} className="w-5 h-5 text-[10px]" />}
          <span className="text-xs font-semibold text-slate-400">
            {isUser ? t('chat.you') : characterName}
          </span>

          {/* SillyTavern Swipes Pagination for Assistant */}
          {hasMultipleSwipes && (
            <div className="flex items-center bg-slate-900 border border-accent-500/30 rounded-md text-[11px] text-accent-300 px-1 py-0.5 gap-1">
              <button
                onClick={() => switchMessageSwipe(msg.id, msg.swipe_index - 1)}
                disabled={msg.swipe_index <= 0 || isGenerating}
                className="hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('chat.prevSwipe')}
                aria-label={t('chat.prevSwipe')}
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span
                className="font-mono"
                aria-label={t('chat.swipeCounter', { current: msg.swipe_index + 1, total: msg.swipes.length })}
              >
                {msg.swipe_index + 1} / {msg.swipes.length}
              </span>
              <button
                onClick={() => switchMessageSwipe(msg.id, msg.swipe_index + 1)}
                disabled={msg.swipe_index >= msg.swipes.length - 1 || isGenerating}
                className="hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('chat.nextSwipe')}
                aria-label={t('chat.nextSwipe')}
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Past Reasoning block */}
        {msg.thought && (
          <div className="mb-2 max-w-[85%] rounded-lg border border-accent-500/20 bg-accent-950/20 text-xs overflow-hidden">
            <button
              onClick={() => setThoughtOpen((open) => !open)}
              aria-expanded={thoughtOpen}
              className="w-full flex items-center justify-between px-3 py-1.5 text-accent-300 hover:bg-accent-900/30 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-accent-400" />
                <span className="font-mono">{t('chat.reasoning')}</span>
              </div>
              {thoughtOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {thoughtOpen && (
              <div className="p-3 border-t border-accent-500/20 text-slate-300 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                {msg.thought}
              </div>
            )}
          </div>
        )}

        {msg.attachments.length > 0 && (
          <div className={`mb-1.5 flex flex-wrap gap-2 max-w-[85%] ${isUser ? 'justify-end' : ''}`}>
            {msg.attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        )}

        {/* Message Bubble or Inline Edit Textarea */}
        {editContent !== null ? (
          <div className="w-full max-w-[85%] space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              aria-label={t('chat.editMessage')}
              autoFocus
              rows={4}
              className="w-full bg-slate-900 border border-accent-500 rounded-2xl p-3 text-sm text-slate-100 focus:outline-hidden resize-none"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={saveEdit}
                className="flex items-center gap-1 px-3 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('chat.save')}</span>
              </button>
              <button
                onClick={() => setEditContent(null)}
                className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative group/bubble max-w-[85%]">
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? 'bg-linear-to-r from-accent-600 to-indigo-600 text-white shadow-md'
                  : 'bg-slate-900 border border-slate-800 text-slate-100 shadow-sm'
              }`}
            >
              <RoleplayMessage
                content={msg.content}
                isUser={isUser}
                onSpeak={!isUser && onSpeak ? () => onSpeak(msg.content) : undefined}
              />
              {shownTranslation !== null && (
                <div className={`mt-2 pt-2 border-t ${isUser ? 'border-white/30' : 'border-slate-700'}`}>
                  <div className={`mb-1 flex items-center gap-1 text-[11px] ${isUser ? 'text-white/70' : 'text-slate-400'}`}>
                    <Languages className="w-3 h-3" />
                    {t('chat.translation')}
                  </div>
                  <RoleplayMessage content={shownTranslation} isUser={isUser} />
                </div>
              )}
            </div>

            {/* Hover Action Buttons */}
            <div
              className={`absolute -bottom-3 ${
                isUser ? 'right-2' : 'left-2'
              } hidden group-hover/bubble:flex group-focus-within/bubble:flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded-lg px-1.5 py-0.5 shadow-lg z-20 text-[11px] text-slate-400`}
            >
              {isAssistant && (
                <>
                  <button
                    onClick={() => regenerateMessageSwipe(msg.id)}
                    disabled={isGenerating}
                    className={BUBBLE_ACTION}
                    title={t('chat.regenerateHint')}
                    aria-label={t('chat.regenerate')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('chat.regenerate')}</span>
                  </button>
                  <button
                    onClick={() => continueChatMessage(msg.id)}
                    disabled={isGenerating}
                    className={BUBBLE_ACTION}
                    title={t('chat.continueHint')}
                    aria-label={t('chat.continue')}
                  >
                    <FastForward className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('chat.continue')}</span>
                  </button>
                </>
              )}
              <button
                onClick={toggleTranslation}
                disabled={translating || !msg.content.trim()}
                className={BUBBLE_ACTION}
                title={t(shownTranslation !== null ? 'chat.hideTranslation' : 'chat.translateHint')}
                aria-label={t(shownTranslation !== null ? 'chat.hideTranslation' : 'chat.translate')}
                aria-pressed={shownTranslation !== null}
              >
                {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setEditContent(msg.content)}
                className={BUBBLE_ACTION}
                title={t('chat.editMessage')}
                aria-label={t('chat.editMessage')}
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={remove}
                className={`${BUBBLE_ACTION} hover:text-rose-400`}
                title={t('chat.deleteMessage')}
                aria-label={t('chat.deleteMessage')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);
ChatMessageItem.displayName = 'ChatMessageItem';

/** Translations by language and text, kept while the app runs. */
const translations = new Map<string, string>();

/** Loaded image attachments, so scrolling a virtualized chat doesn't reload them. */
const imageCache = new Map<string, Promise<string | null>>();
const loadImage = (attachment: Attachment) => {
  let pending = imageCache.get(attachment.file);
  if (!pending) {
    pending = api.getAttachmentDataUrl(attachment).catch(() => null);
    imageCache.set(attachment.file, pending);
  }
  return pending;
};

const AttachmentView: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (attachment.kind !== 'image') return;
    let alive = true;
    loadImage(attachment).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [attachment]);

  if (attachment.kind === 'image') {
    return src ? (
      <img
        src={src}
        alt={attachment.name}
        title={attachment.name}
        className="max-h-48 max-w-full rounded-xl border border-slate-800 object-contain"
      />
    ) : (
      <div className="h-24 w-32 rounded-xl border border-slate-800 bg-slate-900 animate-pulse" aria-label={attachment.name} />
    );
  }
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
      title={attachment.truncated ? t('chat.attachmentTruncated') : attachment.name}
    >
      <FileText className="w-3.5 h-3.5 text-accent-400" />
      <span className="max-w-48 truncate">{attachment.name}</span>
    </div>
  );
};
