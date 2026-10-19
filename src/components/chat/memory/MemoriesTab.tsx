import { useEffect, useState } from 'react';
import { useAppStore, useStoreFields } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { memoryCharacter } from '../../../utils/groupChat';
import type { EpisodicMemory } from '../../../types';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { Search, Sparkles, X } from 'lucide-react';
import { MemoryItem } from './MemoryItem';

type MemoryCategory = 'fact' | 'secret' | 'promise' | 'event' | 'location';

/** The full-text search needs three letters (trigrams). */
const MIN_SEARCH_CHARS = 3;

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
  const characterId = useAppStore((state) => memoryCharacter(state)?.id);
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<EpisodicMemory[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searching = search.trim().length >= MIN_SEARCH_CHARS;

  // Searches again after typing stops and whenever the memories change (edit, pin, forget).
  useEffect(() => {
    const query = search.trim();
    if (!characterId || query.length < MIN_SEARCH_CHARS) {
      setSearchHits(null);
      setSearchError(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      api.searchEpisodicMemories(characterId, query)
        .then((hits) => {
          if (current) { setSearchHits(hits); setSearchError(null); }
        })
        .catch((error) => {
          if (current) setSearchError(errorMessage(error));
        });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [characterId, search, cognitiveOverview]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await addManualMemory(newMemCategory, newMemContent.trim(), newMemSignificance);
      setNewMemContent('');
      toast.success(translate('memory.memorySaved'));
    } catch (error) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(error) }));
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

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('memory.searchPlaceholder')}
            aria-label={t('memory.search')}
            className="w-full pl-8 pr-8 py-1.5 [&::-webkit-search-cancel-button]:hidden bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('memory.searchClear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {searching ? (
          <div className="space-y-2">
            {searchError && (
              <div className="p-3 text-xs text-red-300">{t('memory.searchFailed', { error: searchError })}</div>
            )}
            {searchHits?.map((mem) => (
              <MemoryItem key={mem.id} memory={mem} />
            ))}
            {!searchError && searchHits?.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                {t('memory.searchNoHits')}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {cognitiveOverview?.recent_memories.map((mem) => (
              <MemoryItem key={mem.id} memory={mem} />
            ))}

            {!memoryOverviewError && !isMemoryLoading && (!cognitiveOverview?.recent_memories ||
              cognitiveOverview.recent_memories.length === 0) && (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                {t('memory.noMemories')}
              </div>
            )}
          </div>
        )}
      </div>
  );
};
