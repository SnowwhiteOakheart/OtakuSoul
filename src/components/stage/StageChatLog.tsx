import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { StageEventCardView } from './StageEventCardView';
import {
  Compass,
  MessageSquare,
  Sword,
  Brain,
  Clapperboard,
  Ear,
  Bot,
} from 'lucide-react';

export const StageChatLog: React.FC = () => {
  const { stageState, isProcessingStageTurn } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stageState?.chat_log?.length, isProcessingStageTurn]);

  if (!stageState) return null;

  const messages = stageState.chat_log || [];

  const getModeBadge = (mode: string, whisperTarget?: string | null) => {
    switch (mode) {
      case 'say':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-500/30">
            <MessageSquare className="w-2.5 h-2.5" /> Sagt
          </span>
        );
      case 'do':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/30">
            <Sword className="w-2.5 h-2.5" /> Handelt
          </span>
        );
      case 'think':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
            <Brain className="w-2.5 h-2.5" /> Denkt
          </span>
        );
      case 'direct':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-500/30">
            <Clapperboard className="w-2.5 h-2.5" /> Regie
          </span>
        );
      case 'whisper':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
            <Ear className="w-2.5 h-2.5" /> Flüstert {whisperTarget ? `an ${whisperTarget}` : ''}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {messages.map((msg) => {
        const isGm = msg.sender_role === 'gm';
        const isPlayer = msg.sender_role === 'player';
        const isCompanion = msg.sender_role === 'companion';

        if (isGm) {
          return (
            <div
              key={msg.id}
              className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-purple-950/20 to-slate-900/90 border border-purple-500/30 shadow-xl backdrop-blur space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                    <Compass className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                    {msg.sender_name || 'Game Master'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* GM Narration Text */}
              <div className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                {msg.content}
              </div>

              {/* Event Card if attached */}
              {msg.event_card && <StageEventCardView card={msg.event_card} />}
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex flex-col space-y-1.5 ${
              isPlayer ? 'items-end' : 'items-start'
            }`}
          >
            {/* Sender and mode header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-bold text-slate-300">
                {msg.sender_name}
              </span>
              {getModeBadge(msg.turn_mode, msg.whisper_target)}
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl text-xs sm:text-sm shadow-md leading-relaxed whitespace-pre-wrap ${
                isPlayer
                  ? 'bg-blue-600/20 border border-blue-500/40 text-blue-100 rounded-tr-sm'
                  : isCompanion
                  ? 'bg-purple-900/30 border border-purple-500/40 text-purple-100 rounded-tl-sm'
                  : 'bg-slate-800/80 border border-slate-700 text-slate-200 rounded-tl-sm'
              }`}
            >
              {msg.content}

              {/* Event Card if attached */}
              {msg.event_card && <StageEventCardView card={msg.event_card} />}
            </div>
          </div>
        );
      })}

      {/* Processing Turn Indicator */}
      {isProcessingStageTurn && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 animate-pulse text-xs text-purple-300">
          <Bot className="w-4 h-4 animate-spin" />
          <span>Der Spielleiter berechnet Mechaniken und webt die nächste Erzählung...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
