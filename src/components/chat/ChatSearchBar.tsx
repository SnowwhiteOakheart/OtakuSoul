import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import type { StoredChatMessage } from '../../types';

interface ChatSearchBarProps {
  messages: StoredChatMessage[];
  onClose: () => void;
}

/** Full-text search in the open chat; jumps to each hit (Enter next, Shift+Enter previous, Esc closes). */
export const ChatSearchBar = ({ messages, onClose }: ChatSearchBarProps) => {
  const { t, currentLanguage } = useTranslation();
  const requestChatJump = useAppStore((s) => s.requestChatJump);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const hits = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(currentLanguage);
    if (!needle) return [];
    return messages.filter((m) => m.content.toLocaleLowerCase(currentLanguage).includes(needle));
  }, [messages, query, currentLanguage]);

  const go = (index: number) => {
    if (hits.length === 0) return;
    const wrapped = (index + hits.length) % hits.length;
    setCurrent(wrapped);
    requestChatJump(hits[wrapped]!.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(event.shiftKey ? current - 1 : current + 1);
    }
  };

  return (
    <div role="search" className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/80">
      <Search className="w-4 h-4 text-slate-400 shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrent(-1);
        }}
        onKeyDown={onKeyDown}
        placeholder={t('chat.searchPlaceholder')}
        aria-label={t('chat.search')}
        className="flex-1 min-w-0 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-hidden"
      />
      <span role="status" className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
        {query.trim()
          ? hits.length
            ? t('chat.searchCount', { current: Math.max(current, 0) + 1, total: hits.length })
            : t('chat.searchNone')
          : ''}
      </span>
      <button type="button" onClick={() => go(current - 1)} disabled={!hits.length} aria-label={t('chat.searchPrevious')} className="p-1 rounded text-slate-400 hover:text-slate-100 disabled:opacity-40">
        <ChevronUp className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => go(current + 1)} disabled={!hits.length} aria-label={t('chat.searchNext')} className="p-1 rounded text-slate-400 hover:text-slate-100 disabled:opacity-40">
        <ChevronDown className="w-4 h-4" />
      </button>
      <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1 rounded text-slate-400 hover:text-slate-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
