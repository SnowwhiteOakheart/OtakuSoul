import type { LorebookEntry } from '../../types';
import {
  Trash2,
  Flame,
  Edit3,
  Zap,
} from 'lucide-react';
import { useTranslation } from '../../i18n';

interface EntryCardProps {
  entry: LorebookEntry;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** One lorebook entry with its trigger badges and a content preview. */
export const EntryCard = ({ entry, onToggle, onEdit, onDelete }: EntryCardProps) => {
  const { t } = useTranslation();
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        entry.enabled
          ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700/90'
          : 'bg-app/40 border-slate-900 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={onToggle}
            className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
            aria-label={t(entry.enabled ? 'lore.entryActiveToggle' : 'lore.entryInactiveToggle', { name: entry.name })}
      title={t(entry.enabled ? 'lore.entryActiveToggle' : 'lore.entryInactiveToggle', { name: entry.name })}
          />
          <h3 className="text-sm font-bold text-slate-100">{entry.name}</h3>

          {/* Trigger Badge */}
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
            {entry.trigger_type}
          </span>

          {/* Behavior Badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
              entry.injection_behavior === 'active' || entry.injection_behavior === 'directive'
                ? 'bg-accent-500/20 border-accent-500/40 text-accent-300'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {entry.injection_behavior === 'active' || entry.injection_behavior === 'directive' ? (
              <><Zap className="h-3 w-3" aria-hidden />{t('lore.badgeActive')}</>
            ) : t('lore.passive')}
          </span>

          {/* Priority & Probability */}
          <span className="text-[11px] text-slate-400">
            {t('lore.badgePriority', { priority: entry.priority ?? 10, probability: entry.probability ?? 100 })}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
            title={t('lore.edit')}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title={t('lore.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Keys & Filters Tags */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {entry.key.map((k) => (
          <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            {k}
          </span>
        ))}
        {entry.secondary_keys && entry.secondary_keys.length > 0 && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" title={t('lore.secondaryHint')}>
            + {entry.secondary_keys.join(', ')}
          </span>
        )}
        {entry.exclude_key && entry.exclude_key.length > 0 && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/15 text-rose-300 border border-rose-500/30" title={t('lore.excludeHint')}>
            {t('lore.badgeNot', { keys: entry.exclude_key.join(', ') })}
          </span>
        )}
        {entry.tension_threshold && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <Flame className="w-2.5 h-2.5" /> {t('lore.badgeFrom', { value: entry.tension_threshold })}
          </span>
        )}
        {entry.chain_activates && entry.chain_activates.length > 0 && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> {t('lore.badgeActivates', { names: entry.chain_activates.join(', ') })}
          </span>
        )}
      </div>

      {/* Content preview */}
      <p className="text-xs text-slate-300/90 whitespace-pre-wrap line-clamp-3 bg-app/40 p-2.5 rounded-lg border border-slate-800/60 font-sans">
        {entry.content}
      </p>
    </div>
  );
};
