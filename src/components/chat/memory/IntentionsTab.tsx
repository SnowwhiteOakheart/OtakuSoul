import { useEffect, useState } from 'react';
import { Check, CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { useAppStore } from '../../../store/useAppStore';
import { memoryCharacter } from '../../../utils/groupChat';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import type { IntentionDraft, IntentionEntry } from '../../../types';

const ACTION = 'p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-50';
const FIELD = 'bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1.5 focus:outline-hidden focus:border-accent-500';

/** Form values: date and time as the inputs hold them (local), empty = none. */
interface Form { title: string; details: string; initiator: string; timeBasis: string; date: string; time: string }

const EMPTY_FORM: Form = { title: '', details: '', initiator: 'both', timeBasis: 'real', date: '', time: '' };

const pad = (n: number) => String(n).padStart(2, '0');

function toForm(entry: IntentionEntry): Form {
  const due = entry.due_at !== null ? new Date(entry.due_at * 1000) : null;
  return {
    title: entry.title,
    details: entry.details,
    initiator: entry.initiator,
    timeBasis: entry.time_basis,
    date: due ? `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}` : '',
    time: due && entry.due_has_time ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : '',
  };
}

function toDraft(form: Form): IntentionDraft {
  const real = form.timeBasis === 'real' && form.date !== '';
  const due = real ? new Date(`${form.date}T${form.time || '00:00'}`) : null;
  return {
    title: form.title.trim(),
    details: form.details.trim(),
    initiator: form.initiator,
    time_basis: form.timeBasis,
    due_at: due && !Number.isNaN(due.getTime()) ? Math.floor(due.getTime() / 1000) : null,
    due_has_time: real && form.time !== '',
  };
}

/** When an open intention is due, relative to today ("due tomorrow", "overdue since …"). */
function dueText(entry: IntentionEntry, now: Date): string {
  if (entry.time_basis !== 'real') return translate('memory.intentionInStory');
  if (entry.due_at === null) return translate('memory.intentionNoDate');
  const due = new Date(entry.due_at * 1000);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  const time = entry.due_has_time ? due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const date = due.toLocaleDateString();
  if (days < 0 || (days === 0 && entry.due_has_time && due < now)) return translate('memory.intentionOverdue', { date: days === 0 ? time : date });
  if (days === 0) return time ? translate('memory.intentionTodayAt', { time }) : translate('memory.intentionToday');
  if (days === 1) return time ? translate('memory.intentionTomorrowAt', { time }) : translate('memory.intentionTomorrow');
  return translate('memory.intentionOn', { date: time ? `${date} ${time}` : date });
}

const IntentionForm = ({ initial, busy, onSubmit, onCancel, submitLabel }: {
  initial: Form; busy: boolean; submitLabel: string; onSubmit: (form: Form) => void; onCancel?: () => void;
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) onSubmit(form); }}
      className="space-y-2"
    >
      <fieldset disabled={busy} className="space-y-2">
        <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })}
          placeholder={t('memory.intentionTitlePlaceholder')} aria-label={t('memory.intentionTitle')} className={`w-full ${FIELD}`} />
        <input type="text" value={form.details} onChange={(e) => set({ details: e.target.value })}
          placeholder={t('memory.intentionDetailsPlaceholder')} aria-label={t('memory.intentionDetails')} className={`w-full ${FIELD}`} />
        <div className="flex flex-wrap gap-2">
          <select aria-label={t('memory.intentionInitiator')} value={form.initiator} onChange={(e) => set({ initiator: e.target.value })} className={FIELD}>
            {(['both', 'user', 'character'] as const).map((who) => (
              <option key={who} value={who}>{t(`memory.intentionBy.${who}`)}</option>
            ))}
          </select>
          <select aria-label={t('memory.intentionTimeBasis')} value={form.timeBasis} onChange={(e) => set({ timeBasis: e.target.value })} className={FIELD}>
            <option value="real">{t('memory.intentionBasisReal')}</option>
            <option value="story">{t('memory.intentionBasisStory')}</option>
          </select>
          {form.timeBasis === 'real' && (
            <>
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} aria-label={t('memory.intentionDate')} className={FIELD} />
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} disabled={!form.date} aria-label={t('memory.intentionTime')} className={FIELD} />
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-2.5 py-1 rounded-lg text-xs text-slate-300 hover:bg-slate-800">{t('common.cancel')}</button>
          )}
          <button type="submit" disabled={!form.title.trim()} className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold disabled:opacity-50">
            {submitLabel}
          </button>
        </div>
      </fieldset>
    </form>
  );
};

/**
 * Plans and promises of the character towards the current persona: what is due, done or
 * called off. A reflection adds them; resolving one turns it into an episodic memory.
 */
export const IntentionsTab = () => {
  const { t } = useTranslation();
  const characterId = useAppStore((state) => memoryCharacter(state)?.id);
  const userName = useAppStore((state) => state.activePersona.name);
  const overview = useAppStore((state) => state.cognitiveOverview);
  const [result, setResult] = useState<{ key: string; entries: IntentionEntry[]; error: string | null; at: number } | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const key = `${characterId}|${userName}`;

  // Loads again after a reflection (the overview changes) and after every change here.
  useEffect(() => {
    if (!characterId) return;
    let current = true;
    api.getIntentions(characterId, userName, true)
      .then((entries) => { if (current) setResult({ key, entries, error: null, at: Date.now() }); })
      .catch((error) => { if (current) setResult({ key, entries: [], error: errorMessage(error), at: Date.now() }); });
    return () => { current = false; };
  }, [characterId, userName, key, overview, reload]);

  const run = async (action: () => Promise<unknown>, success?: TranslationKey) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(translate(success));
      setReload((n) => n + 1);
      return true;
    } catch (error) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(error) }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const resolve = (entry: IntentionEntry, status: 'fulfilled' | 'abandoned') => {
    if (!characterId) return;
    // The resolved intention becomes an episodic memory: the overview shows it.
    void run(async () => {
      await api.setIntentionStatus(characterId, entry.id, status);
      await useAppStore.getState().fetchCognitiveOverview();
    }, status === 'fulfilled' ? 'memory.intentionFulfilledToast' : 'memory.intentionAbandonedToast');
  };

  const shown = result?.key === key ? result : null;
  const open = shown?.entries.filter((e) => e.status === 'pending') ?? [];
  const resolved = shown?.entries.filter((e) => e.status !== 'pending') ?? [];
  // Due texts are relative to when the list was loaded.
  const now = new Date(shown?.at ?? 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t('memory.intentionsIntro')}</p>

      {adding ? (
        <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70">
          <IntentionForm initial={EMPTY_FORM} busy={busy} submitLabel={t('memory.save')} onCancel={() => setAdding(false)}
            onSubmit={(form) => {
              if (!characterId) return;
              void run(() => api.addIntention(characterId, userName, toDraft(form)), 'memory.intentionSaved').then((ok) => { if (ok) setAdding(false); });
            }} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
          <Plus className="w-3.5 h-3.5" />
          {t('memory.intentionAdd')}
        </button>
      )}

      {shown?.error && <div className="p-3 text-xs text-red-300">{t('memory.intentionsLoadFailed', { error: shown.error })}</div>}

      <ul aria-label={t('memory.intentionsOpen')} className="space-y-2">
        {open.map((entry) => (
          <li key={entry.id} data-intention className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1.5">
            {editing === entry.id ? (
              <IntentionForm initial={toForm(entry)} busy={busy} submitLabel={t('memory.save')} onCancel={() => setEditing(null)}
                onSubmit={(form) => {
                  if (!characterId) return;
                  void run(() => api.updateIntention(characterId, entry.id, toDraft(form))).then((ok) => { if (ok) setEditing(null); });
                }} />
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-100 font-semibold">{entry.title}</p>
                    {entry.details && <p className="text-xs text-slate-300">{entry.details}</p>}
                  </div>
                  <button type="button" onClick={() => resolve(entry, 'fulfilled')} disabled={busy} aria-label={t('memory.intentionFulfill')} title={t('memory.intentionFulfill')} className={`${ACTION} hover:text-emerald-300`}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => resolve(entry, 'abandoned')} disabled={busy} aria-label={t('memory.intentionAbandon')} title={t('memory.intentionAbandon')} className={ACTION}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditing(entry.id)} disabled={busy} aria-label={t('memory.intentionEdit')} title={t('memory.intentionEdit')} className={ACTION}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => characterId && void run(() => api.deleteIntention(characterId, entry.id))} disabled={busy}
                    aria-label={t('memory.intentionDelete')} title={t('memory.intentionDelete')} className={`${ACTION} hover:text-rose-400`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
                  <CalendarClock className="w-3 h-3" />
                  {dueText(entry, now)}
                  <span className="text-slate-500">· {t(`memory.intentionBy.${entry.initiator}` as TranslationKey)}</span>
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      {shown && !shown.error && open.length === 0 && (
        <div className="p-6 text-center text-xs text-slate-400 italic">{t('memory.intentionsNone')}</div>
      )}

      {resolved.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400">{t('memory.intentionsResolved', { count: resolved.length })}</summary>
          <ul className="mt-2 space-y-1.5">
            {resolved.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-slate-400">
                <span className="line-through flex-1">{entry.title}</span>
                <span className="text-[11px]">{t(`memory.intentionStatus.${entry.status}` as TranslationKey)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
