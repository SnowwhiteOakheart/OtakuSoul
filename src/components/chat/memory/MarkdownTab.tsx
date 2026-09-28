import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { RefreshCw, Save } from 'lucide-react';

export const MarkdownTab = () => {
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
  const [mdSaveSuccess, setMdSaveSuccess] = useState(false);
  // Unsaved edits per file; without a draft the editor shows the stored markdown.
  const [drafts, setDrafts] = useState<Partial<Record<'character' | 'user', string>>>({});
  const localMdContent = drafts[mdMode] ?? (mdMode === 'character' ? characterMarkdown : userMarkdown);
  const setLocalMdContent = (value: string) => setDrafts((prev) => ({ ...prev, [mdMode]: value }));
  const discardDraft = () => setDrafts((prev) => ({ ...prev, [mdMode]: undefined }));

  const handleSaveMarkdown = async () => {
    try {
      if (mdMode === 'character') {
        await saveCharacterMarkdown(localMdContent);
      } else {
        await saveUserMarkdown(localMdContent);
      }
      discardDraft();
      setMdSaveSuccess(true);
      setTimeout(() => setMdSaveSuccess(false), 3000);
      toast.success(translate('memory.mdSyncedStatus'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    }
  };

  const handleReloadMarkdown = async () => {
    await fetchMemoryMarkdown();
    discardDraft();
    toast.success(translate('memory.mdReloadedStatus'));
  };

  return (
      <div className="space-y-3 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
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
              onClick={handleReloadMarkdown}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              title={t('memory.mdReloadHint')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('memory.mdReload')}
            </button>
            <button
              onClick={handleSaveMarkdown}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                mdSaveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-accent-600 hover:bg-accent-500 text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {mdSaveSuccess ? t('memory.mdSaved') : t('memory.mdSync')}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          {t('memory.mdHint')}
        </div>

        <textarea
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
