import React, { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Sparkles,
  Trash2,
  Plus,
  Brain,
} from 'lucide-react';

export const ThoughtsTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    companionState, addCompanionThought, clearCompanionThoughts,
  } = useStoreFields(
    'companionState', 'addCompanionThought', 'clearCompanionThoughts',
  );

  const [newThoughtInput, setNewThoughtInput] = useState<string>('');
  const thoughts = companionState?.scratchpad || [];

  const handleAddThought = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThoughtInput.trim()) return;
    await addCompanionThought(newThoughtInput.trim());
    setNewThoughtInput('');
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-400" />
              {t('comp.scratchpad')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('comp.scratchpadIntro')}
            </p>
          </div>

          <button
            onClick={clearCompanionThoughts}
            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('comp.clearThoughts')}
          </button>
        </div>

        {/* Add Thought Form */}
        <form onSubmit={handleAddThought} className="flex gap-2">
          <input
            type="text"
            value={newThoughtInput}
            onChange={(e) => setNewThoughtInput(e.target.value)}
            placeholder={t('comp.thoughtPlaceholder')}
            className="flex-1 px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('comp.addThought')}
          </button>
        </form>
      </div>

      {/* Thoughts List */}
      <div className="space-y-2.5">
        {thoughts.map((item) => (
          <div
            key={item.id}
            className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs flex items-start justify-between gap-4 shadow-sm"
          >
            <div className="space-y-1">
              <span className="flex items-center gap-1 text-[11px] text-accent-400 font-mono font-bold">
                <Brain className="h-3 w-3" aria-hidden />
                {t('comp.innerThought')}
              </span>
              <p className="text-slate-200 italic leading-relaxed">
                "{item.thought}"
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              {new Date(item.ts * 1000).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {thoughts.length === 0 && (
          <div className="p-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-800 bg-slate-900/30">
            {t('comp.noThoughts')}
          </div>
        )}
      </div>
    </div>
  );
};
