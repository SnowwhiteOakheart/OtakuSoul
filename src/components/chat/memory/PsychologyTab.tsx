import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { Flame, Shield, Plus, RefreshCw, Trash2 } from 'lucide-react';

export const PsychologyTab = () => {
  const { t } = useTranslation();
  const {
    cognitiveOverview, updatePsychology, triggerEmotionalDecay,
  } = useStoreFields(
    'cognitiveOverview', 'updatePsychology', 'triggerEmotionalDecay',
  );

  const psych = cognitiveOverview?.psychology;
  const [newBeliefInput, setNewBeliefInput] = useState('');

  const handleAddBelief = async () => {
    if (!newBeliefInput.trim() || !psych) return;
    const currentBeliefs = psych.core_identity || [];
    const updated = {
      ...psych,
      core_identity: [...currentBeliefs, newBeliefInput.trim()],
    };
    await updatePsychology(updated);
    setNewBeliefInput('');
    toast.success(translate('memory.beliefAdded'));
  };

  const handleRemoveBelief = async (index: number) => {
    if (!psych) return;
    const currentBeliefs = psych.core_identity || [];
    const updated = {
      ...psych,
      core_identity: currentBeliefs.filter((_, i) => i !== index),
    };
    await updatePsychology(updated);
    toast.success(translate('memory.beliefRemoved'));
  };

  if (!psych) return null;

  return (
      <div className="space-y-4">
        {/* Core Identity & Unbreakable Beliefs */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              {t('memory.beliefsTitle')}
            </span>
            <span className="text-xs text-slate-400">
              {t('memory.beliefCount', { count: psych.core_identity?.length || 0 })}
            </span>
          </div>

          <div className="space-y-1.5">
            {(psych.core_identity || []).map((belief, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-200"
              >
                <span className="flex-1 pr-2 leading-relaxed">• {belief}</span>
                <button
                  onClick={() => handleRemoveBelief(idx)}
                  className="text-slate-400 hover:text-rose-400 transition p-1"
                  title={t('memory.removeBelief')}
                  aria-label={t('memory.removeBelief')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {(!psych.core_identity || psych.core_identity.length === 0) && (
              <div className="text-xs text-slate-400 italic p-2">
                {t('memory.noBeliefs')}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newBeliefInput}
              onChange={(e) => setNewBeliefInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddBelief()}
              placeholder={t('memory.beliefPlaceholder')}
              aria-label={t('memory.beliefPlaceholder')}
              className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
            />
            <button
              onClick={handleAddBelief}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('memory.add')}
            </button>
          </div>
        </div>

        {/* Primary Emotion & Intensity */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('memory.emotionTitle')}
            </span>
            <button
              onClick={() => triggerEmotionalDecay()}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30 transition"
            >
              <RefreshCw className="w-3 h-3" />
              {t('memory.triggerDecay')}
            </button>
          </div>

          <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2.5">
              <Flame className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-sm font-bold text-slate-100">{psych.primary_emotion}</div>
                <div className="text-xs text-slate-400">
                  {t('memory.decayCounter', { count: psych.emotional_decay_counter })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => updatePsychology({ ...psych, intensity: level })}
                  title={t('memory.intensity', { level })}
                  aria-label={t('memory.intensity', { level })}
                  aria-pressed={level <= psych.intensity}
                  className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition ${
                    level <= psych.intensity
                      ? 'bg-amber-500 text-app shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Psychological Tension */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.tension')}
          </label>
          <input
            aria-label={t('memory.tension')}
            type="text"
            value={psych.psychological_tension}
            onChange={(e) =>
              updatePsychology({ ...psych, psychological_tension: e.target.value })
            }
            className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
            placeholder={t('memory.tensionPlaceholder')}
          />
        </div>

        {/* Cognitive Dissonance */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.dissonance')}
          </label>
          <textarea
            aria-label={t('memory.dissonance')}
            rows={2}
            value={psych.cognitive_dissonance ?? ''}
            onChange={(e) =>
              updatePsychology({ ...psych, cognitive_dissonance: e.target.value })
            }
            className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
            placeholder={t('memory.dissonancePlaceholder')}
          />
        </div>

        {/* Active Agenda */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.agenda')}
          </label>
          <input
            aria-label={t('memory.agenda')}
            type="text"
            value={psych.active_agenda}
            onChange={(e) =>
              updatePsychology({ ...psych, active_agenda: e.target.value })
            }
            className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
            placeholder={t('memory.agendaPlaceholder')}
          />
        </div>

        {/* Immediate Focus */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {t('memory.focus')}
          </label>
          <input
            aria-label={t('memory.focus')}
            type="text"
            value={psych.immediate_focus}
            onChange={(e) =>
              updatePsychology({ ...psych, immediate_focus: e.target.value })
            }
            className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
            placeholder={t('memory.focusPlaceholder')}
          />
        </div>
      </div>
  );
};
