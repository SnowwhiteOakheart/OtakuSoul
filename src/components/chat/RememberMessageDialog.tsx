import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useAppStore } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import type { StoredChatMessage } from '../../types';

const CATEGORIES = ['event', 'fact', 'promise', 'secret', 'location', 'topic'] as const;
/** Longer messages are cut for the suggestion; a memory is a short note, not a copy. */
const SUGGESTION_CHARS = 400;

/** The message as a starting point for the memory: without actions in *…* and directions in ((…)). */
export function memorySuggestion(content: string): string {
  const text = content
    .replace(/\(\([\s\S]*?\)\)/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = text || content.trim();
  return base.length > SUGGESTION_CHARS ? `${base.slice(0, SUGGESTION_CHARS).trimEnd()}…` : base;
}

/**
 * "Remember this message": turns a chat message into a memory of the character, with the
 * message as its source (a later edit of the message flags the memory for review). Rendered into
 * `document.body`: the virtualized message list moves its rows with `transform`, which would
 * pin a fixed overlay to the row.
 */
export const RememberMessageDialog = ({ message, onClose }: { message: StoredChatMessage; onClose: () => void }) => {
  const { t } = useTranslation();
  const addManualMemory = useAppStore((s) => s.addManualMemory);
  const setMemoryDrawerOpen = useAppStore((s) => s.setMemoryDrawerOpen);
  const id = useId();
  const [content, setContent] = useState(() => memorySuggestion(message.content));
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('event');
  const [significance, setSignificance] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addManualMemory(category, content.trim(), significance, { chatId: message.chat_id, messageIds: [message.id] });
      onClose();
      toast.success(translate('chat.rememberSaved'), { label: translate('chat.rememberShow'), onClick: () => setMemoryDrawerOpen(true) });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return createPortal(
    <ModalOverlay onClose={onClose} aria-labelledby={`${id}-title`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <form onSubmit={save} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl space-y-3" data-remember-dialog>
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Brain className="w-4 h-4 text-accent-400" aria-hidden="true" />
          {t('chat.rememberTitle')}
        </h2>
        <p id={`${id}-hint`} className="text-xs text-slate-400">{t('chat.rememberHint')}</p>
        <fieldset disabled={saving} className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            autoFocus
            aria-label={t('chat.rememberText')}
            aria-describedby={`${id}-hint`}
            className="w-full rounded-xl border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100 focus:outline-hidden focus:border-accent-500 resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              aria-label={t('memory.category')}
              className="rounded-lg border border-slate-700 bg-app px-2 py-1.5 text-xs text-slate-200"
            >
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{t(`memory.cat.${cat}` as TranslationKey)}</option>)}
            </select>
            <select
              value={significance}
              onChange={(e) => setSignificance(Number(e.target.value))}
              aria-label={t('memory.significance')}
              className="rounded-lg border border-slate-700 bg-app px-2 py-1.5 text-xs text-slate-200"
            >
              {([5, 4, 3, 2, 1] as const).map((level) => <option key={level} value={level}>{t(`memory.sig${level}`)}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="text-xs text-rose-300">{t('memory.saveFailed', { error })}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!content.trim()} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500 disabled:opacity-40">
              {saving ? t('common.saving') : t('chat.rememberSave')}
            </button>
          </div>
        </fieldset>
      </form>
    </ModalOverlay>,
    document.body,
  );
};
