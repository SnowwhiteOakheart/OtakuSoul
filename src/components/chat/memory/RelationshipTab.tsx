import { useState } from 'react';
import type { RelationshipState } from '../../../types';
import { errorMessage } from '../../../utils/errors';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { Check, Plus, X } from 'lucide-react';
import { toast } from '../../ui/feedback';

interface RelationshipTabProps {
  value: RelationshipState | undefined;
  isDirty: boolean;
  isSaving: boolean;
  onSavingChange: (saving: boolean) => void;
  onChange: (value: RelationshipState) => void;
  onDiscard: () => void;
}

export const RelationshipTab = ({ value, isDirty, isSaving, onSavingChange, onChange, onDiscard }: RelationshipTabProps) => {
  const { t } = useTranslation();
  const {
    updateRelationship: persistRelationship,
  } = useStoreFields(
    'updateRelationship',
  );

  const rel = value;
  const [newPrefInput, setNewPrefInput] = useState('');
  const [newMilestoneInput, setNewMilestoneInput] = useState('');

  const handleAddPref = () => {
    if (!newPrefInput.trim() || !rel) return;
    const updated = {
      ...rel,
      preferences_habits: [...rel.preferences_habits, newPrefInput.trim()],
    };
    onChange(updated);
    setNewPrefInput('');
  };

  const handleAddMilestone = () => {
    if (!newMilestoneInput.trim() || !rel) return;
    const updated = {
      ...rel,
      shared_milestones: [...rel.shared_milestones, newMilestoneInput.trim()],
    };
    onChange(updated);
    setNewMilestoneInput('');
  };

  const handleSave = async () => {
    if (!rel || !isDirty || isSaving) return;
    onSavingChange(true);
    try {
      await persistRelationship(rel);
      onDiscard();
      toast.success(translate('memory.relSaved'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    } finally {
      onSavingChange(false);
    }
  };

  if (!rel) return null;

  return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-xs text-slate-300">{t(isDirty ? 'memory.unsavedDraft' : 'memory.draftHint')}</p>
          <div className="flex gap-2">
            <button type="button" disabled={!isDirty || isSaving} onClick={onDiscard} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
              {t('memory.discardDraft')}
            </button>
            <button type="button" disabled={!isDirty || isSaving} onClick={handleSave} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">
              {t(isSaving ? 'common.saving' : 'memory.saveRelationship')}
            </button>
          </div>
        </div>
        <fieldset disabled={isSaving} className="space-y-4">
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
                    onChange({ ...rel, role_in_story: e.target.value })
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
                    onChange({ ...rel, known_attributes: e.target.value })
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
                  onClick={() => onChange({ ...rel, trust_level: lvl })}
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
                  onChange({ ...rel, dynamic_description: e.target.value })
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
                  onChange({ ...rel, unspoken_tension: e.target.value })
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
                      onChange({
                        ...rel,
                        preferences_habits: rel.preferences_habits.filter((_, idx) => idx !== i),
                      })
                    }
                    aria-label={t('memory.removeItem', { item: pref })}
                    className="text-slate-400 hover:text-rose-400 transition"
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
                      onChange({
                        ...rel,
                        shared_milestones: rel.shared_milestones.filter((_, idx) => idx !== i),
                      })
                    }
                    aria-label={t('memory.removeItem', { item: m })}
                    className="text-slate-400 hover:text-rose-400 transition"
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
        </fieldset>
      </div>
  );
};
