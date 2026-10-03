import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { RefreshCw, Save } from 'lucide-react';

interface MarkdownTabProps {
  drafts: Partial<Record<'character' | 'user', string>>;
  pending: 'save' | 'reload' | null;
  onDraftsChange: (drafts: Partial<Record<'character' | 'user', string>>) => void;
  onPendingChange: (pending: 'save' | 'reload' | null) => void;
}

export const MarkdownTab = ({ drafts, pending, onDraftsChange, onPendingChange }: MarkdownTabProps) => {
  const { t } = useTranslation();
  const {
    activeCharacter, cognitiveOverview, characterMarkdown, userMarkdown, fetchMemoryMarkdown,
    saveCharacterMarkdown, saveUserMarkdown,
  } = useStoreFields(
    'activeCharacter', 'cognitiveOverview', 'characterMarkdown', 'userMarkdown',
    'fetchMemoryMarkdown', 'saveCharacterMarkdown', 'saveUserMarkdown',
  );

  const charName = activeCharacter?.card.data.name ?? '';
  const rel = cognitiveOverview?.relationship;
  const [mdMode, setMdMode] = useState<'character' | 'user'>('character');
  // Unsaved edits per file; without a draft the editor shows the stored markdown.
  const localMdContent = drafts[mdMode] ?? (mdMode === 'character' ? characterMarkdown : userMarkdown);
  const setLocalMdContent = (value: string) => onDraftsChange({ ...drafts, [mdMode]: value });
  const discardDraft = () => onDraftsChange({ ...drafts, [mdMode]: undefined });

  const handleSaveMarkdown = async () => {
    if (pending) return;
    onPendingChange('save');
    try {
      if (mdMode === 'character') {
        await saveCharacterMarkdown(localMdContent);
      } else {
        await saveUserMarkdown(localMdContent);
      }
      discardDraft();
      toast.success(translate('memory.mdSyncedStatus'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    } finally {
      onPendingChange(null);
    }
  };

  const handleReloadMarkdown = async () => {
    if (pending) return;
    onPendingChange('reload');
    try {
      await fetchMemoryMarkdown();
      discardDraft();
      toast.success(translate('memory.mdReloadedStatus'));
    } catch (e) {
      toast.error(translate('memory.loadFailed', { error: errorMessage(e) }));
    } finally {
      onPendingChange(null);
    }
  };

  return (
      <div className="space-y-3 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              disabled={pending !== null}
              onClick={() => setMdMode('character')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                mdMode === 'character'
                  ? 'bg-accent-600 text-white border-accent-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              MEMORY.md ({charName})
            </button>
            <button
              disabled={pending !== null}
              onClick={() => setMdMode('user')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                mdMode === 'user'
                  ? 'bg-accent-600 text-white border-accent-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              USER.md ({rel?.user_name || t('memory.mdUser')})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={pending !== null}
              onClick={handleReloadMarkdown}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              title={t('memory.mdReloadHint')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t(pending === 'reload' ? 'common.loading' : 'memory.mdReload')}
            </button>
            <button
              disabled={pending !== null}
              onClick={handleSaveMarkdown}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition bg-accent-600 hover:bg-accent-500 text-white disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              {t(pending === 'save' ? 'common.saving' : 'memory.mdSync')}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          {t('memory.mdHint')}
        </div>

        <textarea
          disabled={pending !== null}
          value={localMdContent}
          onChange={(e) => setLocalMdContent(e.target.value)}
          rows={18}
          className="w-full flex-1 p-3 bg-app font-mono text-xs text-slate-200 border border-slate-800 rounded-xl focus:outline-hidden focus:border-accent-500 leading-relaxed resize-y"
          placeholder={t('memory.mdLoading')}
          aria-label={t('memory.tabMarkdown')}
        />
      </div>
  );
};
