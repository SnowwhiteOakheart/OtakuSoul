import { useState } from 'react';
import { FileUp, MousePointerClick, Plus, Trash2 } from 'lucide-react';
import { OptionHint } from './OptionHint';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { toast } from '../ui/feedback';
import { NEW_QUICK_REPLY, importSillyTavernQuickReplies } from '../../utils/quickReplies';
import type { QuickReply } from '../../types/generated/QuickReply';

const FIELD =
  'w-full rounded-lg border border-slate-700 bg-app px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500';

/**
 * Quick replies: buttons above the chat input with prepared messages, sent at once or put into
 * the field. SillyTavern quick reply sets import into them (without their slash command scripts).
 */
export const QuickReplySettings = () => {
  const { t, tPlural } = useTranslation();
  const { quickReplies, setQuickReplies } = useStoreFields('quickReplies', 'setQuickReplies');
  // Text fields save when they lose focus, not on every key.
  const [replies, setReplies] = useState<QuickReply[]>(quickReplies);
  const commit = (next: QuickReply[] = replies) => {
    setReplies(next);
    setQuickReplies(next);
  };
  const edit = (index: number, patch: Partial<QuickReply>) =>
    setReplies((current) => current.map((reply, i) => (i === index ? { ...reply, ...patch } : reply)));

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { replies: imported, skipped } = importSillyTavernQuickReplies(JSON.parse(await file.text()));
      commit([...replies, ...imported]);
      toast.success(tPlural('quickReplies.imported', imported.length)
        + (skipped > 0 ? ` ${tPlural('quickReplies.importSkipped', skipped)}` : ''));
    } catch {
      toast.error(t('quickReplies.importFailed'));
    }
  };

  return (
    <div id="setting-quick-replies" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-accent-400" />
          {t('quickReplies.title')}
        </h2>
        <OptionHint id="settings-quick-replies-hint">{t('quickReplies.hint')}</OptionHint>
      </div>
      {replies.map((reply, index) => (
        <div key={index} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-800 p-2" data-quick-reply>
          <input
            value={reply.label}
            onChange={(e) => edit(index, { label: e.target.value })}
            onBlur={() => commit()}
            placeholder={t('quickReplies.label')}
            aria-label={t('quickReplies.label')}
            className={`${FIELD} w-36`}
          />
          <textarea
            value={reply.message}
            onChange={(e) => edit(index, { message: e.target.value })}
            onBlur={() => commit()}
            rows={1}
            placeholder={t('quickReplies.message')}
            aria-label={t('quickReplies.message')}
            aria-describedby="settings-quick-replies-hint"
            className={`${FIELD} flex-1 min-w-48 resize-y`}
          />
          <select
            value={reply.mode}
            onChange={(e) => commit(replies.map((r, i) => (i === index ? { ...r, mode: e.target.value } : r)))}
            aria-label={t('quickReplies.mode')}
            className="rounded-lg border border-slate-700 bg-app px-2 py-1.5 text-xs text-slate-200"
          >
            <option value="send">{t('quickReplies.modeSend')}</option>
            <option value="insert">{t('quickReplies.modeInsert')}</option>
          </select>
          <button
            type="button"
            onClick={() => commit(replies.filter((_, i) => i !== index))}
            className="p-1.5 text-slate-400 hover:text-rose-400"
            aria-label={t('quickReplies.remove')}
            title={t('quickReplies.remove')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setReplies((current) => [...current, NEW_QUICK_REPLY])}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('quickReplies.add')}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-accent-400">
          <FileUp className="w-3.5 h-3.5" />
          {t('quickReplies.import')}
          <input type="file" accept=".json" className="sr-only" onChange={(e) => void importFile(e)} data-quick-replies-import />
        </label>
      </div>
    </div>
  );
};
