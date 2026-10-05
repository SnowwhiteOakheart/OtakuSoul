import { useState } from 'react';
import { AlertTriangle, Check, History, Link2, Pencil, Pin, PinOff, Star, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import { useAppStore } from '../../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { confirmDialog, toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import type { EpisodicMemory, MemoryChange } from '../../../types';

const CATEGORIES = ['fact', 'topic', 'secret', 'promise', 'event', 'location'] as const;
const ACTION = 'p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-40';

const originKey = (origin: string): TranslationKey =>
  (['auto', 'manual', 'edited'].includes(origin) ? `memory.origin.${origin}` : 'memory.origin.unknown') as TranslationKey;

/**
 * One episodic memory: where it comes from (model, user, corrected; chat and messages), pinning,
 * correcting, forgetting and its history. A changed source message asks for a check.
 */
export const MemoryItem = ({ memory }: { memory: EpisodicMemory }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<{ category: string; content: string; significance: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<MemoryChange[] | null>(null);
  const sourceTitle = useAppStore(
    (s) => s.chatSessions.find((session) => session.id === memory.source_chat_id)?.title,
  );

  const run = async (action: () => Promise<void>, success?: TranslationKey) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(translate(success));
      return true;
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const store = () => useAppStore.getState();

  const save = async () => {
    if (!draft || !draft.content.trim()) return;
    if (await run(() => store().editMemory(memory.id, draft.category, draft.content.trim(), draft.significance), 'memory.memoryCorrected')) {
      setDraft(null);
      setHistory(null);
    }
  };

  const forget = async () => {
    const confirmed = await confirmDialog({
      title: translate('memory.forgetTitle'),
      message: translate('memory.forgetText', { content: memory.content.slice(0, 120) }),
      confirmLabel: translate('memory.forget'),
      tone: 'danger',
    });
    if (confirmed) await run(() => store().forgetMemory(memory.id), 'memory.memoryForgotten');
  };

  const toggleHistory = async () => {
    if (history) return setHistory(null);
    const cid = store().activeCharacter?.id;
    if (!cid) return;
    try {
      setHistory(await api.getMemoryHistory(cid, memory.id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** Opens the source chat if needed and jumps to the first message the memory came from. */
  const showSource = async () => {
    const [first] = memory.source_message_ids;
    if (!memory.source_chat_id || !first) return;
    if (store().activeChatId !== memory.source_chat_id) await store().switchChatSession(memory.source_chat_id);
    store().setMemoryDrawerOpen(false);
    store().requestChatJump(first);
  };

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 transition ${
        memory.needs_review ? 'bg-amber-950/30 border-amber-500/50' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded bg-accent-900/60 text-accent-300 border border-accent-500/30">
          {(CATEGORIES as readonly string[]).includes(memory.category) ? t(`memory.cat.${memory.category}` as TranslationKey) : memory.category}
        </span>
        <span className="flex items-center text-amber-400" aria-label={`${t('memory.significance')}: ${memory.significance}`}>
          {Array.from({ length: memory.significance }, (_, index) => (
            <Star key={index} className="h-3 w-3 fill-current" aria-hidden />
          ))}
        </span>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded border ${
            memory.origin === 'auto'
              ? 'border-slate-600 text-slate-400'
              : memory.origin
                ? 'border-emerald-500/40 text-emerald-300'
                : 'border-slate-700 text-slate-500'
          }`}
        >
          {t(originKey(memory.origin))}
        </span>
        {memory.pinned && <span className="text-[11px] text-sky-300">{t('memory.pinnedLabel')}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void run(() => store().setMemoryPinned(memory.id, !memory.pinned))}
            disabled={busy}
            aria-pressed={memory.pinned}
            aria-label={t(memory.pinned ? 'memory.unpin' : 'memory.pin')}
            title={t(memory.pinned ? 'memory.unpin' : 'memory.pinHint')}
            className={ACTION}
          >
            {memory.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setDraft({ category: memory.category, content: memory.content, significance: memory.significance })}
            disabled={busy || draft !== null}
            aria-label={t('memory.correct')}
            title={t('memory.correct')}
            className={ACTION}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => void toggleHistory()} aria-pressed={history !== null} aria-label={t('memory.history')} title={t('memory.history')} className={ACTION}>
            <History className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => void forget()} disabled={busy} aria-label={t('memory.forget')} title={t('memory.forget')} className={`${ACTION} hover:text-rose-400`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {memory.needs_review && (
        <div role="note" className="flex flex-wrap items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{t('memory.reviewHint')}</span>
          <button
            type="button"
            onClick={() => void run(() => store().confirmMemory(memory.id), 'memory.memoryConfirmed')}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/10"
          >
            <Check className="w-3 h-3" />
            {t('memory.keep')}
          </button>
        </div>
      )}

      {draft ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              aria-label={t('memory.category')}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(`memory.cat.${cat}`)}</option>
              ))}
            </select>
            <select
              aria-label={t('memory.significance')}
              value={draft.significance}
              onChange={(e) => setDraft({ ...draft, significance: Number(e.target.value) })}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1"
            >
              {([5, 4, 3, 2, 1] as const).map((level) => (
                <option key={level} value={level}>{t(`memory.sig${level}`)}</option>
              ))}
            </select>
          </div>
          <textarea
            aria-label={t('memory.correct')}
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            disabled={busy}
            rows={3}
            className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className="px-2.5 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || !draft.content.trim()} className="px-2.5 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold disabled:opacity-50">
              {busy ? t('common.saving') : t('memory.save')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{memory.content}</p>
      )}

      {memory.source_chat_id && memory.source_message_ids.length > 0 && (
        <button type="button" onClick={() => void showSource()} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-accent-300">
          <Link2 className="w-3 h-3" />
          {t('memory.source', { chat: sourceTitle ?? t('memory.sourceChat') })}
        </button>
      )}

      {history && (
        <ol aria-label={t('memory.history')} className="space-y-1 border-t border-slate-700/60 pt-2 text-[11px] text-slate-400">
          {history.map((change, index) => (
            <li key={index}>
              <span className="text-slate-300">{t(`memory.change.${change.action}` as TranslationKey)}</span>
              {' · '}
              {new Date(change.at * 1000).toLocaleString()}
              {change.action === 'edited' && change.content_before && (
                <span className="block line-through opacity-70">{change.content_before}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
