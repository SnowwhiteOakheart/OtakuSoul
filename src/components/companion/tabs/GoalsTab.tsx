import React, { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import {
  Target,
  Trash2,
  Check,
  Plus,
} from 'lucide-react';

export const GoalsTab: React.FC = () => {
  const { t, currentLanguage } = useTranslation();
  const {
    companionState, addCompanionGoal, markCompanionGoalCompleted, deleteCompanionGoal,
  } = useStoreFields(
    'companionState', 'addCompanionGoal', 'markCompanionGoalCompleted', 'deleteCompanionGoal',
  );

  const [goalSummaryInput, setGoalSummaryInput] = useState<string>('');
  const [goalDueMinutes, setGoalDueMinutes] = useState<number>(30);
  const goals = companionState?.goals || [];

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalSummaryInput.trim()) return;
    await addCompanionGoal(goalSummaryInput.trim(), goalDueMinutes);
    setGoalSummaryInput('');
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="border-b border-slate-800 pb-2.5">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            {t('comp.goals')}
          </h3>
          <p className="text-xs text-slate-400">
            {t('comp.goalsIntro')}
          </p>
        </div>

        {/* New Goal Form */}
        <form onSubmit={handleAddGoal} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={goalSummaryInput}
            onChange={(e) => setGoalSummaryInput(e.target.value)}
            placeholder={t('comp.promisePlaceholder')}
            className="flex-1 min-w-[240px] px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-amber-500"
          />

          <select
            value={goalDueMinutes}
            onChange={(e) => setGoalDueMinutes(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-app border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-hidden"
          >
            <option value={15}>{t('comp.in15')}</option>
            <option value={30}>{t('comp.in30')}</option>
            <option value={60}>{t('comp.in60')}</option>
            <option value={120}>{t('comp.in120')}</option>
            <option value={240}>{t('comp.tonight')}</option>
            <option value={720}>{t('comp.tomorrow')}</option>
          </select>

          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('comp.addPromise')}
          </button>
        </form>
      </div>

      {/* Goals List */}
      <div className="space-y-2.5">
        {goals.map((g) => {
          const isPending = g.status === 'pending';
          return (
            <div
              key={g.id}
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-4 transition shadow-sm ${
                isPending
                  ? 'bg-slate-900/80 border-amber-500/30'
                  : 'bg-app/40 border-slate-800 text-slate-400'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                      isPending
                        ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isPending ? 'Ausstehend' : 'Erledigt'}
                  </span>
                  <span className="font-bold text-slate-100">{g.summary}</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono block">
                  {t('comp.goalDue', {
                    time: new Date(g.due_at).toLocaleTimeString(currentLanguage, { hour: '2-digit', minute: '2-digit' }),
                    date: new Date(g.created_at).toLocaleDateString(currentLanguage),
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isPending && (
                  <button
                    onClick={() => markCompanionGoalCompleted(g.id)}
                    className="px-3 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-1 transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('comp.done')}
                  </button>
                )}
                <button
                  onClick={() => deleteCompanionGoal(g.id)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="p-12 text-center text-xs text-slate-400 italic rounded-2xl border border-slate-800 bg-slate-900/30">
            {t('comp.noGoals')}
          </div>
        )}
      </div>
    </div>
  );
};
