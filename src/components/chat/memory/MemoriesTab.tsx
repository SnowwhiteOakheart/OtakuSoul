import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { Sparkles, Star } from 'lucide-react';

type MemoryCategory = 'fact' | 'secret' | 'promise' | 'event' | 'location';

export const MemoriesTab = () => {
  const { t } = useTranslation();
  const {
    cognitiveOverview, memoryOverviewError, isMemoryLoading, addManualMemory,
  } = useStoreFields(
    'cognitiveOverview', 'memoryOverviewError', 'isMemoryLoading', 'addManualMemory',
  );

  const [newMemCategory, setNewMemCategory] = useState<MemoryCategory>('fact');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemSignificance, setNewMemSignificance] = useState(3);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await addManualMemory(newMemCategory, newMemContent.trim(), newMemSignificance);
      setNewMemContent('');
      toast.success(translate('memory.memorySaved'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
      <div className="space-y-4">
        <form
          onSubmit={handleAddMemory}
          className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
        >
          <fieldset disabled={isSaving} className="space-y-2.5">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {t('memory.addKnowledge')}
            </div>
            <div className="flex gap-2">
              <select
                aria-label={t('memory.category')}
                value={newMemCategory}
                onChange={(e) => setNewMemCategory(e.target.value as MemoryCategory)}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
              >
                {(['fact', 'topic', 'secret', 'promise', 'event', 'location'] as const).map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`memory.cat.${cat}`)}
                  </option>
                ))}
              </select>

              <select
                aria-label={t('memory.significance')}
                value={newMemSignificance}
                onChange={(e) => setNewMemSignificance(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
              >
                {([5, 4, 3, 2, 1] as const).map((level) => (
                  <option key={level} value={level}>
                    {t(`memory.sig${level}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newMemContent}
                onChange={(e) => setNewMemContent(e.target.value)}
                placeholder={t('memory.memoryPlaceholder')}
                aria-label={t('memory.addKnowledge')}
                className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold"
              >
                {isSaving ? t('common.saving') : t('memory.save')}
              </button>
            </div>
          </fieldset>
        </form>

        <div className="space-y-2">
          {cognitiveOverview?.recent_memories.map((mem) => (
            <div
              key={mem.id}
              className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start justify-between gap-3 hover:border-slate-600 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded bg-accent-900/60 text-accent-300 border border-accent-500/30">
                    {(['fact', 'topic', 'secret', 'promise', 'event', 'location'] as string[]).includes(mem.category)
                      ? t(`memory.cat.${mem.category}` as TranslationKey)
                      : mem.category}
                  </span>
                  <span className="flex items-center text-amber-400" aria-label={`${t('memory.significance')}: ${mem.significance}`}>
                    {Array.from({ length: mem.significance }, (_, index) => (
                      <Star key={index} className="h-3 w-3 fill-current" aria-hidden />
                    ))}
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{mem.content}</p>
              </div>
            </div>
          ))}

          {!memoryOverviewError && !isMemoryLoading && (!cognitiveOverview?.recent_memories ||
            cognitiveOverview.recent_memories.length === 0) && (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              {t('memory.noMemories')}
            </div>
          )}
        </div>
      </div>
  );
};
