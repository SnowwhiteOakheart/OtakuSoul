import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import type { CleanupGroup, CleanupProposal } from '../../../types';

/**
 * "Tidy up memory": the model proposes groups of overlapping memories with one summary each.
 * Nothing changes until the user takes (and may edit) the groups; merged memories are
 * superseded, so a merge can be taken back under "outdated memories".
 */
export const MemoryCleanup = () => {
  const { t } = useTranslation();
  const { proposeMemoryCleanup, applyMemoryCleanup, memoryOperation, isReflecting } = useStoreFields(
    'proposeMemoryCleanup', 'applyMemoryCleanup', 'memoryOperation', 'isReflecting',
  );
  const [draft, setDraft] = useState<{ proposal: CleanupProposal; groups: (CleanupGroup & { chosen: boolean })[] } | null>(null);
  const busy = !!memoryOperation || isReflecting;

  const propose = async () => {
    try {
      const proposal = await proposeMemoryCleanup();
      if (proposal.groups.length === 0) {
        toast.success(translate('memory.cleanupNothing'));
        return;
      }
      setDraft({ proposal, groups: proposal.groups.map((g) => ({ ...g, chosen: true })) });
    } catch (error) {
      toast.error(translate('memory.cleanupFailed', { error: errorMessage(error) }));
    }
  };

  const apply = async () => {
    if (!draft) return;
    const chosen: CleanupGroup[] = draft.groups
      .filter((g) => g.chosen && g.summary.trim())
      .map((g) => ({ memory_ids: g.memory_ids, category: g.category, title: g.title, summary: g.summary }));
    try {
      const merged = await applyMemoryCleanup(chosen);
      toast.success(translate('memory.cleanupDone', { count: merged }));
      setDraft(null);
    } catch (error) {
      toast.error(translate('memory.cleanupFailed', { error: errorMessage(error) }));
    }
  };

  const change = (index: number, patch: Partial<CleanupGroup & { chosen: boolean }>) =>
    setDraft((d) => d && { ...d, groups: d.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) });

  if (!draft) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => void propose()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 disabled:opacity-50"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {memoryOperation === 'cleanup' ? t('memory.cleanupRunning') : t('memory.cleanup')}
        </button>
        <p className="text-[11px] text-slate-500">{t('memory.cleanupHint')}</p>
      </div>
    );
  }

  const chosenCount = draft.groups.filter((g) => g.chosen).length;
  return (
    <section aria-label={t('memory.cleanupProposal')} data-cleanup-proposal className="p-3.5 rounded-xl bg-slate-800/50 border border-accent-500/40 space-y-3">
      <p className="text-xs text-slate-200 font-semibold">{t('memory.cleanupProposal')}</p>
      <p className="text-[11px] text-slate-400">{t('memory.cleanupProposalHint')}</p>
      {draft.groups.map((group, index) => (
        <div key={group.memory_ids.join('-')} data-cleanup-group className="space-y-1.5 border-t border-slate-700/60 pt-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={group.chosen} onChange={(e) => change(index, { chosen: e.target.checked })} className="accent-accent-500" />
            {group.title || t('memory.cleanupGroup', { count: group.memory_ids.length })}
          </label>
          <ul className="space-y-0.5 pl-6">
            {group.memory_ids.map((id) => (
              <li key={id} className="text-[11px] text-slate-500 line-through line-clamp-2">
                {draft.proposal.sources.find((m) => m.id === id)?.content ?? `#${id}`}
              </li>
            ))}
          </ul>
          <textarea
            value={group.summary}
            onChange={(e) => change(index, { summary: e.target.value })}
            disabled={!group.chosen}
            rows={3}
            aria-label={t('memory.cleanupSummary')}
            className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500 disabled:opacity-50"
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setDraft(null)} disabled={busy} className="px-2.5 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
          {t('memory.cleanupDiscard')}
        </button>
        <button type="button" onClick={() => void apply()} disabled={busy || chosenCount === 0}
          className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold disabled:opacity-50">
          {t('memory.cleanupApply', { count: chosenCount })}
        </button>
      </div>
    </section>
  );
};
