import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { Dices, Sparkles, AlertOctagon, Send, CheckCircle2, XCircle } from 'lucide-react';
import { translate, useTranslation } from '../../i18n';

export const DiceRoller: React.FC = () => {
  const { t } = useTranslation();
  const { rollDice, lastDiceRoll, isRollingDice, runStageTurn, isProcessingStageTurn } = useStoreFields(
    'rollDice', 'lastDiceRoll', 'isRollingDice', 'runStageTurn', 'isProcessingStageTurn',
  );
  const [formula, setFormula] = useState('1d20+3');
  const [targetDc, setTargetDc] = useState<string>('15');

  const standardDice = ['d4', 'd6', 'd8', 'd10', 'd12', '1d20', '1d100', '2d6'];

  const handleRoll = (f?: string) => {
    const toRoll = f || formula;
    const dcNum = targetDc.trim() ? parseInt(targetDc) : undefined;
    rollDice(toRoll, isNaN(dcNum as number) ? undefined : dcNum);
  };

  const handleSendToChat = () => {
    if (!lastDiceRoll) return;
    const { formula: rolledFormula, sum, individual_rolls, is_critical_success, is_critical_failure, dc_check } =
      lastDiceRoll;

    let text = translate('stage.rollMessage', { formula: rolledFormula, sum, rolls: individual_rolls.join(', ') });

    if (is_critical_success) {
      text += translate('stage.rollMessageCrit');
    } else if (is_critical_failure) {
      text += translate('stage.rollMessageFumble');
    }

    if (dc_check) {
      text += translate(dc_check.passed ? 'stage.rollMessagePassed' : 'stage.rollMessageFailed', {
        dc: dc_check.target_dc,
        margin: dc_check.margin,
      });
    }

    runStageTurn(text, 'direct');
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
            <Dices className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">{t('stage.diceTitle')}</h3>
            <p className="text-xs text-slate-400">{t('stage.diceIntro')}</p>
          </div>
        </div>
      </div>

      {/* Quick Dice Bar */}
      <div role="group" aria-label={t('stage.quickDice')} className="flex flex-wrap gap-1.5">
        {standardDice.map((d) => (
          <button
            key={d}
            onClick={() => {
              setFormula(d);
              handleRoll(d);
            }}
            disabled={isRollingDice}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
              formula === d
                ? 'bg-accent-600/30 text-accent-200 border-accent-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label htmlFor="dice-formula" className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            {t('stage.formula')}
          </label>
          <input
            id="dice-formula"
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="1d20+4"
            className="w-full px-3 py-1.5 bg-app border border-slate-700 rounded-lg text-sm font-mono text-slate-100 focus:outline-hidden focus:border-accent-500"
          />
        </div>

        <div>
          <label htmlFor="dice-dc" className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            {t('stage.targetDc')}
          </label>
          <input
            id="dice-dc"
            type="number"
            value={targetDc}
            onChange={(e) => setTargetDc(e.target.value)}
            placeholder="15"
            className="w-full px-3 py-1.5 bg-app border border-slate-700 rounded-lg text-sm font-mono text-slate-100 focus:outline-hidden focus:border-accent-500"
          />
        </div>
      </div>

      <button
        onClick={() => handleRoll()}
        disabled={isRollingDice}
        className={`w-full py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 ${
          isRollingDice
            ? 'bg-accent-700/50 text-accent-300 cursor-not-allowed'
            : 'bg-linear-to-r from-accent-600 to-accent2-600 hover:from-accent-500 hover:to-accent2-500 text-white shadow-accent-500/20 active:scale-[0.99]'
        }`}
      >
        <Dices className={`w-4 h-4 ${isRollingDice ? 'animate-spin' : ''}`} />
        <span>{isRollingDice ? t('stage.rolling') : t('stage.roll')}</span>
      </button>

      {/* Result Display Banner */}
      {lastDiceRoll && (
        <div
          className={`p-4 rounded-xl border transition-all space-y-2 ${
            lastDiceRoll.is_critical_success
              ? 'bg-amber-950/30 border-amber-500/60 shadow-lg shadow-amber-950/40 ring-1 ring-amber-400/40 animate-pulse'
              : lastDiceRoll.is_critical_failure
              ? 'bg-rose-950/30 border-rose-500/60 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
              : 'bg-app/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              {lastDiceRoll.formula} ➔ {t('stage.diceBreakdown', { rolls: lastDiceRoll.individual_rolls.join(', ') })}
              {lastDiceRoll.modifier !== 0 &&
                ` ${lastDiceRoll.modifier > 0 ? '+' : ''}${lastDiceRoll.modifier}`}
            </span>

            {/* Critical Banners */}
            {lastDiceRoll.is_critical_success && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                {t('stage.critSuccess')}
              </span>
            )}
            {lastDiceRoll.is_critical_failure && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-bold flex items-center gap-1">
                <AlertOctagon className="w-3 h-3 text-rose-400" />
                {t('stage.critFail')}
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-slate-100">
                {lastDiceRoll.sum}
              </span>
              <span className="text-xs text-slate-400">{t('stage.total')}</span>
            </div>

            {/* DC evaluation */}
            {lastDiceRoll.dc_check && (
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {lastDiceRoll.dc_check.passed ? (
                  <span className="text-emerald-400 flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/40 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('stage.dcPassed', { dc: lastDiceRoll.dc_check.target_dc, margin: lastDiceRoll.dc_check.margin })}
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1 bg-rose-950/40 border border-rose-500/40 px-2 py-0.5 rounded-md">
                    <XCircle className="w-3.5 h-3.5" />
                    {t('stage.dcFailed', { dc: lastDiceRoll.dc_check.target_dc, margin: lastDiceRoll.dc_check.margin })}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSendToChat}
            disabled={isProcessingStageTurn}
            className="w-full mt-2 py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-accent-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-accent-500/20 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t('stage.sendRoll')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
