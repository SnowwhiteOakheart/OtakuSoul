import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { Shield } from 'lucide-react';

export const HealingTab = () => {
  const { t } = useTranslation();
  const {
    cognitiveOverview,
  } = useStoreFields(
    'cognitiveOverview',
  );

  return (
      <div className="space-y-3">
        <div className="text-xs text-slate-400">
          {t('memory.healingIntro')}
        </div>

        {cognitiveOverview?.healing_logs.map((log) => (
          <div
            key={log.id}
            className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 text-xs flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-200">{log.action}</div>
                <div className="text-slate-400 text-xs leading-relaxed">{log.details}</div>
              </div>
            </div>
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              {new Date(log.created_at * 1000).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {(!cognitiveOverview?.healing_logs ||
          cognitiveOverview.healing_logs.length === 0) && (
          <div className="p-8 text-center text-xs text-slate-400 italic">
            {t('memory.healingEmpty')}
          </div>
        )}
      </div>
  );
};
