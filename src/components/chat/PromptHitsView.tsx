import { BookOpen, BookMarked, Brain, ScrollText } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { PromptHits } from '../../store/helpers';
import { useAppStore } from '../../store/useAppStore';

/** Header button of a reply: how many lorebook entries and memories it could draw on. */
export const PromptHitsButton = ({ hits, open, onToggle }: { hits: PromptHits; open: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const label = t('chat.hitsLabel', { lore: hits.lore.length, memories: hits.memories.length });
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      title={label}
      data-prompt-hits={hits.lore.length + hits.memories.length}
      className="flex items-center gap-1 rounded-md border border-slate-700/80 px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
    >
      {/* Lorebook entries and memories apart: what the world added and what the character remembered. */}
      {hits.lore.length > 0 && (
        <span className="flex items-center gap-0.5 text-amber-300" data-prompt-hits-lore={hits.lore.length}>
          <BookMarked className="w-3 h-3" aria-hidden="true" />
          {hits.lore.length}
        </span>
      )}
      {(hits.memories.length > 0 || hits.lore.length === 0) && (
        <span className="flex items-center gap-0.5">
          {hits.memories.length > 0 ? <Brain className="w-3 h-3" aria-hidden="true" /> : <BookOpen className="w-3 h-3" aria-hidden="true" />}
          {hits.memories.length}
        </span>
      )}
    </button>
  );
};

/** What went into the prompt of this reply besides the chat itself. */
export const PromptHitsList = ({ hits }: { hits: PromptHits }) => {
  const { t } = useTranslation();
  const openBook = (name: string) => {
    const store = useAppStore.getState();
    const book = store.allLorebooks.find((b) => b.name === name);
    if (book) store.selectLorebook(book);
    store.setActiveTab('lorebooks');
  };
  return (
    <div className="mb-2 max-w-[85%] rounded-lg border border-slate-700/80 bg-slate-900/70 p-2.5 text-xs text-slate-300 space-y-2" data-prompt-hits-list>
      <p className="text-slate-400">{t('chat.hitsIntro')}</p>
      {hits.lore.length > 0 && (
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-200">
            <BookMarked className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
            {t('chat.hitsLore')}
          </h4>
          <ul className="space-y-0.5 pl-5 list-disc">
            {hits.lore.map((entry, i) => (
              <li key={`${entry.book}-${entry.name}-${i}`}>
                <span className="text-slate-100">{entry.name}</span>
                {entry.book && (
                  <>
                    {' · '}
                    <button type="button" onClick={() => openBook(entry.book)} className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200" title={t('chat.hitsOpenBook', { name: entry.book })}>
                      {entry.book}
                    </button>
                  </>
                )}
                {entry.directive && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-200">{t('chat.hitsDirective')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {hits.memories.length > 0 && (
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-200">
            <Brain className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
            {t('chat.hitsMemories')}
          </h4>
          <ul className="max-h-40 overflow-y-auto space-y-0.5 pl-5 list-disc">
            {hits.memories.map((memory) => (
              <li key={memory.id}>
                <span className="text-slate-400">[{memory.category}]</span> {memory.content}
              </li>
            ))}
          </ul>
        </section>
      )}
      {hits.summary && (
        <p className="flex items-center gap-1.5 text-slate-400">
          <ScrollText className="w-3.5 h-3.5" aria-hidden="true" />
          {t('chat.hitsSummary')}
        </p>
      )}
      {hits.lore.length === 0 && hits.memories.length === 0 && !hits.summary && <p>{t('chat.hitsNone')}</p>}
    </div>
  );
};
