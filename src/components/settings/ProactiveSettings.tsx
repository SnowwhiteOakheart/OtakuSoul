import { BellRing } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { Toggle } from '../ui/Toggle';

const PAUSES = [60, 120, 240, 480, 1440];
const DAILY_LIMITS = [1, 2, 3, 5];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const SELECT = 'w-full px-3 py-2 rounded-lg bg-app border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500';

/**
 * "Characters write on their own": off by default, because it uses the AI unasked (with a cloud
 * provider: the user's credit). The details show once it is on; a single character can be
 * excluded in the chat menu.
 */
export const ProactiveSettings = () => {
  const { t, tPlural } = useTranslation();
  const { proactive, setProactive } = useStoreFields('proactive', 'setProactive');
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <div id="setting-proactive" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <BellRing className="w-4 h-4 text-accent-400" />
          {t('proactive.title')}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('proactive.intro')}</p>
      </div>
      <Toggle
        id="setting-proactive-toggle"
        checked={proactive.enabled}
        onCheckedChange={(enabled) => setProactive({ enabled })}
        label={t('proactive.toggle')}
        description={t(proactive.enabled ? 'proactive.on' : 'proactive.off')}
        className="-mx-2"
      />
      {proactive.enabled && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-300">
              <span className="block font-medium">{t('proactive.pause')}</span>
              <select id="setting-proactive-pause" className={SELECT} value={proactive.idle_minutes}
                onChange={(e) => setProactive({ idle_minutes: Number(e.target.value) })}>
                {[...new Set([...PAUSES, proactive.idle_minutes])].sort((a, b) => a - b).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes % 60 === 0 ? tPlural('proactive.hours', minutes / 60) : tPlural('proactive.minutes', minutes)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span className="block font-medium">{t('proactive.perDay')}</span>
              <select id="setting-proactive-limit" className={SELECT} value={proactive.max_per_day}
                onChange={(e) => setProactive({ max_per_day: Number(e.target.value) })}>
                {[...new Set([...DAILY_LIMITS, proactive.max_per_day])].sort((a, b) => a - b).map((count) => (
                  <option key={count} value={count}>{tPlural('proactive.timesPerDay', count)}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-300">{t('proactive.quiet')}</legend>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <select aria-label={t('proactive.quietFrom')} className={SELECT} value={proactive.quiet_start_hour}
                onChange={(e) => setProactive({ quiet_start_hour: Number(e.target.value) })}>
                {HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}
              </select>
              <span>–</span>
              <select aria-label={t('proactive.quietUntil')} className={SELECT} value={proactive.quiet_end_hour}
                onChange={(e) => setProactive({ quiet_end_hour: Number(e.target.value) })}>
                {HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-slate-500">
              {proactive.quiet_start_hour === proactive.quiet_end_hour ? t('proactive.quietNone') : t('proactive.quietHint')}
            </p>
          </fieldset>
          <Toggle
            id="setting-proactive-notify"
            checked={proactive.notify}
            onCheckedChange={(notify) => setProactive({ notify })}
            label={t('proactive.notify')}
            description={t('proactive.notifyHint')}
            className="-mx-2"
          />
          <Toggle
            id="setting-proactive-dreams"
            checked={proactive.dreams}
            onCheckedChange={(dreams) => setProactive({ dreams })}
            label={t('proactive.dreams')}
            description={t('proactive.dreamsHint')}
            className="-mx-2"
          />
          <Toggle
            id="setting-proactive-selfie"
            checked={proactive.with_selfie}
            onCheckedChange={(with_selfie) => setProactive({ with_selfie })}
            label={t('proactive.withSelfie')}
            description={t('proactive.withSelfieHint')}
            className="-mx-2"
          />
          <p className="text-[11px] text-slate-500">{t('proactive.howItWorks')}</p>
        </div>
      )}
    </div>
  );
};
