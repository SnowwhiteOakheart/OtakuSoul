import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../../i18n';
import { Check, Plus, X } from 'lucide-react';

export const RelationshipTab = () => {
  const { t } = useTranslation();
  const {
    cognitiveOverview, updateRelationship,
  } = useStoreFields(
    'cognitiveOverview', 'updateRelationship',
  );

  const rel = cognitiveOverview?.relationship;
  const [newPrefInput, setNewPrefInput] = useState('');
  const [newMilestoneInput, setNewMilestoneInput] = useState('');

  const handleAddPref = async () => {
    if (!newPrefInput.trim() || !rel) return;
    const updated = {
      ...rel,
      preferences_habits: [...rel.preferences_habits, newPrefInput.trim()],
    };
    await updateRelationship(updated);
    setNewPrefInput('');
  };

  const handleAddMilestone = async () => {
    if (!newMilestoneInput.trim() || !rel) return;
    const updated = {
      ...rel,
      shared_milestones: [...rel.shared_milestones, newMilestoneInput.trim()],
    };
    await updateRelationship(updated);
    setNewMilestoneInput('');
  };

  if (!rel) return null;

  return (
      <div className="space-y-4">
        {/* User Identity & Role in Story */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.roleTitle', { name: rel.user_name })}
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mem-role" className="text-xs text-slate-400 block mb-1">{t('memory.roleInStory')}</label>
              <input
                id="mem-role"
                type="text"
                value={rel.role_in_story ?? ''}
                onChange={(e) =>
                  updateRelationship({ ...rel, role_in_story: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              />
            </div>
            <div>
              <label htmlFor="mem-attributes" className="text-xs text-slate-400 block mb-1">{t('memory.knownAttributes')}</label>
              <input
                id="mem-attributes"
                type="text"
                placeholder={t('memory.none')}
                value={rel.known_attributes ?? ''}
                onChange={(e) =>
                  updateRelationship({ ...rel, known_attributes: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              />
            </div>
          </div>
        </div>

        {/* Trust Level & Dynamic Description */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.trustTitle')}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {[
              'Distrustful',
              'Wary',
              'Neutral',
              'Developing Trust',
              'Deeply Bound',
              'Unstable',
            ].map((lvl) => (
              <button
                key={lvl}
                onClick={() => updateRelationship({ ...rel, trust_level: lvl })}
                aria-pressed={rel.trust_level === lvl}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                  rel.trust_level === lvl
                    ? 'bg-accent-600/30 text-accent-200 border-accent-500'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {t(`memory.trust.${lvl}` as TranslationKey)}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="mem-dynamic" className="text-xs text-slate-400 block mb-1">{t('memory.dynamic')}</label>
            <input
              id="mem-dynamic"
              type="text"
              value={rel.dynamic_description ?? ''}
              onChange={(e) =>
                updateRelationship({ ...rel, dynamic_description: e.target.value })
              }
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              placeholder={t('memory.dynamicPlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="mem-unspoken" className="text-xs text-slate-400 block mb-1">{t('memory.unspoken')}</label>
            <input
              id="mem-unspoken"
              type="text"
              value={rel.unspoken_tension}
              onChange={(e) =>
                updateRelationship({ ...rel, unspoken_tension: e.target.value })
              }
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              placeholder={t('memory.unspokenPlaceholder')}
            />
          </div>
        </div>

        {/* Preferences & Habits */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.preferences', { count: rel.preferences_habits.length })}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {rel.preferences_habits.map((pref, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full bg-slate-900 text-xs text-slate-300 border border-slate-700/80 flex items-center gap-1.5"
              >
                {pref}
                <button
                  onClick={() =>
                    updateRelationship({
                      ...rel,
                      preferences_habits: rel.preferences_habits.filter((_, idx) => idx !== i),
                    })
                  }
                  aria-label={t('memory.removeItem', { item: pref })}
                  className="text-slate-500 hover:text-rose-400 transition"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPrefInput}
              onChange={(e) => setNewPrefInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPref()}
              placeholder={t('memory.preferencePlaceholder')}
              aria-label={t('memory.preferencePlaceholder')}
              className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
            />
            <button
              onClick={handleAddPref}
              className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('memory.add')}
            </button>
          </div>
        </div>

        {/* Shared Milestones */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.milestones', { count: rel.shared_milestones.length })}
          </span>
          <div className="space-y-1.5">
            {rel.shared_milestones.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300"
              >
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                  {m}
                </span>
                <button
                  onClick={() =>
                    updateRelationship({
                      ...rel,
                      shared_milestones: rel.shared_milestones.filter((_, idx) => idx !== i),
                    })
                  }
                  aria-label={t('memory.removeItem', { item: m })}
                  className="text-slate-500 hover:text-rose-400 transition"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newMilestoneInput}
              onChange={(e) => setNewMilestoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
              placeholder={t('memory.milestonePlaceholder')}
              aria-label={t('memory.milestonePlaceholder')}
              className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
            />
            <button
              onClick={handleAddMilestone}
              className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('memory.add')}
            </button>
          </div>
        </div>
      </div>
  );
};
