import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import {
  MessageSquare,
  Sword,
  Brain,
  Clapperboard,
  Ear,
  Send,
  RotateCcw,
  Sparkles,
  Users,
  Loader2,
} from 'lucide-react';
import { TaggedChoice } from '../../types';
import { useTranslation, type TranslationKey } from '../../i18n';

export const TurnControlBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    stageState,
    stageTurnMode,
    setStageTurnMode,
    stageWhisperTarget,
    setStageWhisperTarget,
    stageForceActor,
    setStageForceActor,
    runStageTurn,
    undoStageTurn,
    isProcessingStageTurn,
  } = useStoreFields(
    'stageState', 'stageTurnMode', 'setStageTurnMode', 'stageWhisperTarget',
    'setStageWhisperTarget', 'stageForceActor', 'setStageForceActor', 'runStageTurn',
    'undoStageTurn', 'isProcessingStageTurn',
  );

  const [input, setInput] = useState('');

  if (!stageState) return null;

  const choices = stageState.pending_choices || [];
  const party = stageState.definition.party || [];

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isProcessingStageTurn) return;

    setInput('');
    try {
      await runStageTurn(trimmed);
    } catch (err) {
      console.error(err);
    }
  };

  const handleChoiceClick = async (choice: TaggedChoice) => {
    if (isProcessingStageTurn) return;
    const mode = choice.action_type || 'say';
    if (mode === 'say' || mode === 'do' || mode === 'think' || mode === 'whisper' || mode === 'direct') {
      setStageTurnMode(mode);
    }
    try {
      await runStageTurn(choice.text, mode);
    } catch (err) {
      console.error(err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modeButtons = [
    { mode: 'say', label: t('stage.modeSay'), icon: MessageSquare, color: 'text-blue-400', desc: t('stage.modeSayHint') },
    { mode: 'do', label: t('stage.modeDo'), icon: Sword, color: 'text-amber-400', desc: t('stage.modeDoHint') },
    { mode: 'think', label: t('stage.modeThink'), icon: Brain, color: 'text-accent-400', desc: t('stage.modeThinkHint') },
    { mode: 'direct', label: t('stage.modeDirect'), icon: Clapperboard, color: 'text-rose-400', desc: t('stage.modeDirectHint') },
    { mode: 'whisper', label: t('stage.modeWhisper'), icon: Ear, color: 'text-emerald-400', desc: t('stage.modeWhisperHint') },
  ] as const;

  const placeholders: Record<string, TranslationKey> = {
    say: 'stage.placeholderSay',
    do: 'stage.placeholderDo',
    think: 'stage.placeholderThink',
    direct: 'stage.placeholderDirect',
    whisper: 'stage.placeholderWhisper',
  };

  return (
    <div className="bg-slate-900/95 border-t border-slate-800 p-3 sm:p-4 backdrop-blur-md space-y-3">
      {/* 1. Tagged Choices Pills */}
      {choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5 pb-1">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-accent-400" />
            {t('stage.suggestions')}
          </span>
          {choices.map((choice, idx) => {
            const isCombat = choice.action_type === 'do';
            const isWhisper = choice.action_type === 'whisper';

            return (
              <button
                key={idx}
                onClick={() => handleChoiceClick(choice)}
                disabled={isProcessingStageTurn}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  isCombat
                    ? 'bg-amber-950/40 border-amber-600/50 hover:bg-amber-900/60 text-amber-200'
                    : isWhisper
                    ? 'bg-emerald-950/40 border-emerald-600/50 hover:bg-emerald-900/60 text-emerald-200'
                    : 'bg-accent-950/40 border-accent-600/50 hover:bg-accent-900/60 text-accent-200'
                } disabled:opacity-50`}
              >
                <span>{choice.text}</span>
                {choice.badge && (
                  <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 font-mono font-bold text-amber-300">
                    {choice.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Mode Selector & Next Actor dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Modes */}
        <div role="group" aria-label={t('stage.modeLabel')} className="flex items-center gap-1 p-1 rounded-xl bg-app/80 border border-slate-800">
          {modeButtons.map(({ mode, label, icon: Icon, color, desc }) => {
            const isActive = stageTurnMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setStageTurnMode(mode)}
                title={desc}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-semibold whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                  isActive
                    ? 'bg-accent-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : color}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Whisper Target & Next Actor */}
        <div className="flex items-center gap-2">
          {stageTurnMode === 'whisper' && (
            <div className="flex items-center gap-1.5 bg-app px-2.5 py-1 rounded-lg border border-slate-800">
              <Ear className="w-3.5 h-3.5 text-emerald-400" />
              <input
                type="text"
                placeholder={t('stage.whisperTarget')}
                aria-label={t('stage.whisperTarget')}
                value={stageWhisperTarget}
                onChange={(e) => setStageWhisperTarget(e.target.value)}
                className="bg-transparent text-xs text-emerald-300 focus:outline-hidden w-28"
              />
            </div>
          )}

          {party.length > 0 && (
            <div className="flex items-center gap-1.5 bg-app px-2.5 py-1 rounded-lg border border-slate-800">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label={t('stage.nextSpeaker')}
                value={stageForceActor}
                onChange={(e) => setStageForceActor(e.target.value)}
                className="bg-transparent text-xs text-slate-300 focus:outline-hidden"
              >
                <option value="">{t('stage.nextAuto')}</option>
                {party.map((p) => (
                  <option key={p} value={p}>
                    {t('stage.nextActor', { name: p })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Undo Turn Button */}
          <button
            onClick={() => undoStageTurn()}
            disabled={isProcessingStageTurn}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition disabled:opacity-50"
            title={t('stage.undoHint')}
            aria-label={t('stage.undoHint')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('stage.undo')}</span>
          </button>
        </div>
      </div>

      {/* 3. Text Input & Send */}
      <form onSubmit={handleSend} className="relative flex items-end gap-2">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(placeholders[stageTurnMode] ?? 'stage.placeholderSay')}
          aria-label={t('stage.inputLabel')}
          disabled={isProcessingStageTurn}
          className="flex-1 bg-app/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none shadow-inner"
        />

        <button
          type="submit"
          disabled={isProcessingStageTurn || !input.trim()}
          aria-label={t('stage.sendTurn')}
          className="h-10 px-4 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-accent-950/50 transition disabled:opacity-40 disabled:hover:bg-accent-600"
        >
          {isProcessingStageTurn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">{t('stage.sendTurn')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
