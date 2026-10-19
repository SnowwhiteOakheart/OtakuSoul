import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../../../services/api';
import { useAppStore } from '../../../store/useAppStore';
import { memoryCharacter } from '../../../utils/groupChat';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import type { EpisodicMemory } from '../../../types';

/**
 * Memories a newer version or a contradiction replaced: crossed out with the reason, and the
 * user can take one back. They are kept for the history but never go into a prompt.
 */
export const SupersededMemories = () => {
  const { t } = useTranslation();
  const characterId = useAppStore((state) => memoryCharacter(state)?.id);
  const overview = useAppStore((state) => state.cognitiveOverview);
  const [result, setResult] = useState<{ characterId: string; memories: EpisodicMemory[]; error: string | null } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Loads again whenever the memories change (a reflection, a restore).
  useEffect(() => {
    if (!characterId) return;
    let current = true;
    api.getSupersededMemories(characterId)
      .then((memories) => { if (current) setResult({ characterId, memories, error: null }); })
      .catch((error) => { if (current) setResult({ characterId, memories: [], error: errorMessage(error) }); });
    return () => { current = false; };
  }, [characterId, overview]);

  const restore = async (memory: EpisodicMemory) => {
    if (!characterId) return;
    setBusyId(memory.id);
    try {
      await api.restoreSupersededMemory(characterId, memory.id);
      toast.success(translate('memory.supersededRestored'));
      await useAppStore.getState().fetchCognitiveOverview();
    } catch (error) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(error) }));
    } finally {
      setBusyId(null);
    }
  };

  const shown = result?.characterId === characterId ? result : null;
  if (!shown) return null;
  if (shown.error) {
    return <div className="p-3 text-xs text-red-300">{t('memory.supersededLoadFailed', { error: shown.error })}</div>;
  }
  if (shown.memories.length === 0) {
    return <div className="p-4 text-center text-xs text-slate-400 italic">{t('memory.supersededNone')}</div>;
  }
  return (
    <ul aria-label={t('memory.supersededList')} className="space-y-2">
      {shown.memories.map((memory) => (
        <li key={memory.id} data-superseded-memory className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1.5">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-slate-500 line-through whitespace-pre-wrap">{memory.content}</p>
            <button
              type="button"
              onClick={() => void restore(memory)}
              disabled={busyId !== null}
              aria-label={t('memory.supersededRestore')}
              title={t('memory.supersededRestore')}
              className="p-1 rounded text-slate-400 hover:text-accent-300 hover:bg-slate-800 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            {memory.supersede_reason
              ? t('memory.supersededBecause', { reason: memory.supersede_reason })
              : memory.superseded_by !== null
                ? t('memory.supersededByNewer')
                : t('memory.supersededOutdated')}
            {memory.superseded_at !== null && ` · ${new Date(memory.superseded_at * 1000).toLocaleString()}`}
          </p>
        </li>
      ))}
    </ul>
  );
};
