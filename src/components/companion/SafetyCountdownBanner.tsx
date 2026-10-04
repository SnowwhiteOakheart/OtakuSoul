import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { ShieldAlert, Check, X, Clock, Terminal } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { ToolCallRequest, ToolExecutionResult } from '../../types';
import { effectLabel, toolEffects } from './toolEffects';

interface SafetyCountdownProps {
  pendingCall: ToolCallRequest;
  totalSeconds: number;
  resolveToolCall: (callId: string, approved: boolean) => Promise<ToolExecutionResult | null>;
}

const SafetyCountdown = ({ pendingCall, totalSeconds, resolveToolCall }: SafetyCountdownProps) => {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState(totalSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Timed out -> auto reject for safety
          resolveToolCall(pendingCall.id, false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingCall.id, resolveToolCall]);

  const percent = Math.round((secondsRemaining / totalSeconds) * 100);
  const isCode = pendingCall.tool_name === 'execute_code';
  const codeArgs = (pendingCall.arguments ?? {}) as { language?: unknown; code?: unknown };
  const effects = toolEffects(pendingCall.tool_name, pendingCall.arguments);

  return (
    <div className="fixed top-20 right-6 z-50 max-w-lg w-full p-4 rounded-2xl bg-slate-900 border-2 border-amber-500/80 shadow-2xl shadow-amber-950/50 backdrop-blur-xl animate-in slide-in-from-top duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>{t('safety.title')}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 font-mono">
                {t('safety.hitl')}
              </span>
            </h3>

            <div className="flex items-center gap-1 text-xs font-mono font-bold text-amber-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{secondsRemaining}s</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-app border border-slate-800 text-xs font-mono space-y-1">
            <div className="text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-accent-400" />
              <span>
                {t('safety.tool')} <strong>{pendingCall.tool_name}</strong>
              </span>
            </div>
            {isCode ? (
              <>
                <div className="text-slate-400">{t('safety.language', { language: String(codeArgs.language ?? '') })}</div>
                {/* The whole script, as it will run, not an escaped JSON string. */}
                <pre className="max-h-60 overflow-auto whitespace-pre text-slate-200 bg-slate-950/60 rounded-lg p-2">{String(codeArgs.code ?? '')}</pre>
              </>
            ) : (
              <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(pendingCall.arguments, null, 2)}
              </pre>
            )}
          </div>

          <ul className="flex flex-wrap gap-1.5" aria-label={t('safety.effects')}>
            {effects.length === 0 ? (
              <li className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                {t('comp.effect.none')}
              </li>
            ) : (
              effects.map((effect) => (
                <li
                  key={effect}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-200 border border-amber-500/30"
                >
                  {t(effectLabel(effect))}
                </li>
              ))
            )}
          </ul>

          {pendingCall.tool_name === 'execute_code' && (
            <p className="text-xs text-amber-200">{t('comp.tool.codeWarning')}</p>
          )}

          {/* Countdown Progress Bar */}
          <div className="w-full bg-app rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 bg-linear-to-r from-amber-500 via-rose-500 to-rose-600 transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => resolveToolCall(pendingCall.id, false)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-500/50 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
              {t('safety.deny')}
            </button>
            <button
              onClick={() => resolveToolCall(pendingCall.id, true)}
              className="px-4 py-1.5 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition flex items-center gap-1.5 active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              {t('safety.approve', { seconds: secondsRemaining })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SafetyCountdownBanner: React.FC = () => {
  const { companionState, resolveToolCall } = useStoreFields('companionState', 'resolveToolCall');
  const pendingCall = companionState?.pending_tool_calls?.[0];
  if (!pendingCall) return null;

  const totalSeconds = companionState?.settings?.countdown_seconds || 25;
  return (
    <SafetyCountdown
      key={`${pendingCall.id}-${totalSeconds}`}
      pendingCall={pendingCall}
      totalSeconds={totalSeconds}
      resolveToolCall={resolveToolCall}
    />
  );
};
