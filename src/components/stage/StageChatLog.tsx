import React, { useEffect, useRef, useState } from 'react';
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
  Edit3,
  Trash2,
  RotateCcw,
  Volume2,
  Check,
  X,
} from 'lucide-react';
import { translate } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';

export const StageChatLog: React.FC = () => {
  const {
    stageState,
    isProcessingStageTurn,
    editStageTurnMessage,
    deleteStageTurnMessage,
    regenerateStageTurn,
  } = useAppStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stageState?.chat_log?.length, isProcessingStageTurn]);

  if (!stageState) return null;

  const messages = stageState.chat_log || [];

  const handleStartEdit = (id: string, content: string) => {
    setEditingMessageId(id);
    setEditDraft(content);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    try {
      await editStageTurnMessage(id, editDraft.trim());
      setEditingMessageId(null);
    } catch (err: any) {
      toast.error(translate('toast.editFailed', { error: String(err) }));
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteStageMessageTitle'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (confirmed) {
      try {
        await deleteStageTurnMessage(id);
      } catch (err: any) {
        toast.error(translate('toast.deleteFailed', { error: String(err) }));
      }
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerateStageTurn();
    } catch (err: any) {
      toast.error(translate('toast.regenerateFailed', { error: String(err) }));
    }
  };

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      window.speechSynthesis.speak(utterance);
    }
  };

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
          <span className="flex items-center gap-1 text-[10px] font-semibold text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded-full border border-accent-500/30">
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 relative z-10">
      {messages.map((msg, index) => {
        const isGm = msg.sender_role === 'gm';
        const isPlayer = msg.sender_role === 'player';
        const isCompanion = msg.sender_role === 'companion';
        const isLastMessage = index === messages.length - 1;
        const isEditing = editingMessageId === msg.id;

        if (isGm) {
          return (
            <div
              key={msg.id}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-accent-950/25 to-slate-900/90 border border-accent-500/30 shadow-xl backdrop-blur space-y-2.5"
            >
              {/* Floating Action Bar on Hover */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-app/90 border border-slate-700/80 rounded-xl px-1.5 py-1 shadow-lg backdrop-blur">
                <button
                  onClick={() => handleSpeak(msg.content)}
                  title="Vorlesen (TTS)"
                  className="p-1 rounded-lg text-slate-400 hover:text-accent-300 hover:bg-slate-800 transition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleStartEdit(msg.id, msg.content)}
                  title="Nachricht bearbeiten"
                  className="p-1 rounded-lg text-slate-400 hover:text-accent-300 hover:bg-slate-800 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {isLastMessage && (
                  <button
                    onClick={handleRegenerate}
                    title="Zug neu generieren"
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  title="Nachricht löschen"
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between border-b border-accent-500/20 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent-500/20 text-accent-300">
                    <Compass className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-accent-200 uppercase tracking-wider">
                    {msg.sender_name || 'Game Master'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono pr-20 group-hover:pr-24 transition-all">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* GM Narration Text or Edit Mode */}
              {isEditing ? (
                <div className="space-y-2 pt-1">
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    className="w-full p-2.5 rounded-xl bg-app border border-accent-500/50 text-xs text-slate-100 focus:outline-none focus:border-accent-400 resize-y"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingMessageId(null)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                    >
                      <X className="w-3 h-3" /> Abbrechen
                    </button>
                    <button
                      onClick={() => handleSaveEdit(msg.id)}
                      className="px-3 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Check className="w-3 h-3" /> Speichern
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.content}
                </div>
              )}

              {/* Event Card if attached */}
              {msg.event_card && <StageEventCardView card={msg.event_card} />}
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`group relative flex flex-col space-y-1.5 ${
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

            {/* Bubble & Hover Actions */}
            <div className="relative group max-w-[85%] sm:max-w-[75%]">
              {/* Floating Action Bar on Hover */}
              <div
                className={`absolute -top-3 ${
                  isPlayer ? 'left-2' : 'right-2'
                } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-app/95 border border-slate-700/80 rounded-xl px-1.5 py-0.5 shadow-lg backdrop-blur z-20`}
              >
                <button
                  onClick={() => handleSpeak(msg.content)}
                  title="Vorlesen (TTS)"
                  className="p-1 rounded-lg text-slate-400 hover:text-accent-300 hover:bg-slate-800 transition"
                >
                  <Volume2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleStartEdit(msg.id, msg.content)}
                  title="Nachricht bearbeiten"
                  className="p-1 rounded-lg text-slate-400 hover:text-accent-300 hover:bg-slate-800 transition"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                {isLastMessage && (
                  <button
                    onClick={handleRegenerate}
                    title="Zug neu generieren"
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  title="Nachricht löschen"
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {isEditing ? (
                <div className="p-3 rounded-2xl bg-slate-900 border border-accent-500/50 space-y-2">
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    className="w-full p-2 rounded-xl bg-app border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-accent-400 resize-y"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingMessageId(null)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                    >
                      <X className="w-3 h-3" /> Abbrechen
                    </button>
                    <button
                      onClick={() => handleSaveEdit(msg.id)}
                      className="px-3 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Check className="w-3 h-3" /> Speichern
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm shadow-md leading-relaxed whitespace-pre-wrap ${
                    isPlayer
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-100 rounded-tr-sm'
                      : isCompanion
                      ? 'bg-accent-900/30 border border-accent-500/40 text-accent-100 rounded-tl-sm'
                      : 'bg-slate-800/80 border border-slate-700 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {msg.content}

                  {/* Event Card if attached */}
                  {msg.event_card && <StageEventCardView card={msg.event_card} />}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Processing Turn Indicator */}
      {isProcessingStageTurn && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-accent-950/30 border border-accent-500/30 animate-pulse text-xs text-accent-300">
          <Bot className="w-4 h-4 animate-spin" />
          <span>Der Spielleiter berechnet Mechaniken und webt die nächste Erzählung...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
