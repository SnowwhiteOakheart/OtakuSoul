import { NotebookPen } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Toggle } from '../ui/Toggle';

const EVENING_HOURS = [17, 18, 19, 20, 21, 22, 23];
const SELECT = 'w-full px-3 py-2 rounded-lg bg-app border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500';

/**
 * "Evening reflection and monthly review": off by default, because it uses the AI unasked. The
 * character of the open chat writes once per evening and once per month into their diary.
 */
export const JournalSettings = () => {
  const { t } = useTranslation();
  const { journal, setJournal } = useStoreFields('journal', 'setJournal');

  return (
    <div id="setting-journal" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-accent-400" />
          {t('journal.title')}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('journal.intro')}</p>
      </div>
      <Toggle
        id="setting-journal-toggle"
        checked={journal.enabled}
        onCheckedChange={(enabled) => setJournal({ enabled })}
        label={t('journal.toggle')}
        description={t(journal.enabled ? 'journal.on' : 'journal.off')}
        className="-mx-2"
      />
      {journal.enabled && (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-slate-300 sm:w-1/2">
            <span className="block font-medium">{t('journal.eveningFrom')}</span>
            <select id="setting-journal-hour" className={SELECT} value={journal.evening_hour}
              onChange={(e) => setJournal({ evening_hour: Number(e.target.value) })}>
              {[...new Set([...EVENING_HOURS, journal.evening_hour])].sort((a, b) => a - b).map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
          <Toggle
            id="setting-journal-check-in"
            checked={journal.check_in}
            onCheckedChange={(check_in) => setJournal({ check_in })}
            label={t('journal.checkIn')}
            description={t('journal.checkInHint')}
            className="-mx-2"
          />
          <Toggle
            id="setting-journal-monthly"
            checked={journal.monthly}
            onCheckedChange={(monthly) => setJournal({ monthly })}
            label={t('journal.monthly')}
            description={t('journal.monthlyHint')}
            className="-mx-2"
          />
          <p className="text-[11px] text-slate-500">{t('journal.howItWorks')}</p>
        </div>
      )}
    </div>
  );
};
