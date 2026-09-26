import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { AdaptiveHud } from './AdaptiveHud';
import { AvatarCanvas } from '../avatar/AvatarCanvas';
import { RoleplayMessage } from './RoleplayMessage';
import { ChatSidebar } from './ChatSidebar';
import {
  Send,
  Square,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Cpu,
  Cloud,
  Eye,
  EyeOff,
  MessageSquare,
  RotateCcw,
  FastForward,
  Edit3,
  Check,
  X,
} from 'lucide-react';

export const ChatView: React.FC = () => {
  const {
    messages,
    storedMessages,
    sendMessage,
    isGenerating,
    abortGeneration,
    clearChat,
    selectedBackend,
    setSelectedBackend,
    serverStatus,
    activeCharacter,
    loadPresetCharacters,
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSessions,
    activeChatId,
    switchMessageSwipe,
    regenerateMessageSwipe,
    continueChatMessage,
    editChatMessage,
    deleteChatMessage,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamThought, setStreamThought] = useState('');
  const [showCurrentThought, setShowCurrentThought] = useState(true);
  const [showAvatar, setShowAvatar] = useState(true);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string | number, boolean>>({});

  // Inline editing state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPresetCharacters();
  }, []);

  // Setup live streaming listeners with bulletproof subscription lifecycle
  useEffect(() => {
    let isSubscribed = true;
    const cleanups: (() => void)[] = [];

    const setup = async () => {
      const uToken = await api.onLlmToken((token) => {
        if (isSubscribed) setStreamText((prev) => prev + token);
      });
      if (!isSubscribed) {
        uToken();
      } else {
        cleanups.push(uToken);
      }

      const uThought = await api.onLlmThought((thought) => {
        if (isSubscribed) setStreamThought((prev) => prev + thought);
      });
      if (!isSubscribed) {
        uThought();
      } else {
        cleanups.push(uThought);
      }

      const uDone = await api.onLlmDone(() => {
        if (isSubscribed) {
          setStreamText('');
          setStreamThought('');
        }
      });
      if (!isSubscribed) {
        uDone();
      } else {
        cleanups.push(uDone);
      }
    };

    setup();

    return () => {
      isSubscribed = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, storedMessages, streamText, streamThought]);

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    sendMessage(input);
    setInput('');
  };

  const toggleThought = (id: string | number) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStartEdit = (msgId: string, currentContent: string) => {
    setEditingMsgId(msgId);
    setEditContent(currentContent);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (editContent.trim()) {
      await editChatMessage(msgId, editContent.trim());
    }
    setEditingMsgId(null);
  };

  const currentSession = chatSessions.find((s) => s.id === activeChatId);

  // Render storedMessages if available, otherwise flat fallback
  const displayList = storedMessages.length > 0 ? storedMessages : messages.map((m, i) => ({
    id: `temp_${i}`,
    chat_id: activeChatId || 'default',
    role: m.role,
    content: m.content,
    thought: m.thought,
    order_index: i,
    swipe_index: 0,
    swipes: [{ content: m.content, thought: m.thought }],
    created_at: 0,
  }));

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-slate-950 overflow-hidden relative">
      {/* Slide-out Chat Sidebar */}
      <ChatSidebar isOpen={chatSidebarOpen} onClose={() => setChatSidebarOpen(false)} />

      {/* Top Chat Bar: Backend Switcher, Session Info & Actions */}
      <div className="h-11 border-b border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          {/* Chat Sessions Sidebar Toggle */}
          <button
            onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              chatSidebarOpen
                ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:text-white hover:bg-slate-700/80'
            }`}
            title="Gespräche, Author's Note & HUD-Presets öffnen"
          >
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold">{currentSession?.title || 'Gespräche'}</span>
          </button>

          {/* Backend Selector */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs font-medium">
            <button
              onClick={() => setSelectedBackend('local')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                selectedBackend === 'local'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Lokales LLM</span>
            </button>
            <button
              onClick={() => setSelectedBackend('cloud')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                selectedBackend === 'cloud'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud API</span>
            </button>
          </div>

          {selectedBackend === 'local' && serverStatus.state !== 'running' && (
            <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md hidden md:inline">
              Lokaler Server ist offline. Bitte in Einstellungen starten!
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAvatar(!showAvatar)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
              showAvatar
                ? 'bg-purple-950/40 text-purple-300 border-purple-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
            }`}
            title={showAvatar ? 'Avatar verbergen' : 'Avatar anzeigen'}
          >
            {showAvatar ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Avatar</span>
          </button>

          <button
            onClick={clearChat}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded hover:bg-slate-800/50 transition-colors"
            title="Chat-Sitzung löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Adaptive HUD Bar */}
      <AdaptiveHud />

      {/* Main Split Layout: Avatar (Left) + Chat (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {showAvatar && (
          <div className="hidden md:flex w-5/12 lg:w-1/3 h-full">
            <AvatarCanvas
              character={activeCharacter}
              isSpeaking={isGenerating && streamText.length > 0}
            />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
          {/* Messages Stream Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {displayList.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              const isEditing = editingMsgId === msg.id;
              const hasMultipleSwipes = isAssistant && msg.swipes && msg.swipes.length > 1;

              return (
                <div
                  key={msg.id || idx}
                  className={`group flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender Header + Swipes Navigation */}
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-slate-400">
                      {msg.role === 'user' ? 'Du' : activeCharacter?.card.data.name || 'OtakuSoul'}
                    </span>

                    {/* SillyTavern Swipes Pagination for Assistant */}
                    {hasMultipleSwipes && (
                      <div className="flex items-center bg-slate-900 border border-purple-500/30 rounded-md text-[10px] text-purple-300 px-1 py-0.5 gap-1">
                        <button
                          onClick={() => switchMessageSwipe(msg.id, msg.swipe_index - 1)}
                          disabled={msg.swipe_index <= 0 || isGenerating}
                          className="hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Vorherige Antwort-Variante"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <span className="font-mono">
                          {msg.swipe_index + 1} / {msg.swipes.length}
                        </span>
                        <button
                          onClick={() => switchMessageSwipe(msg.id, msg.swipe_index + 1)}
                          disabled={msg.swipe_index >= msg.swipes.length - 1 || isGenerating}
                          className="hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Nächste Antwort-Variante"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Past Reasoning block */}
                  {msg.thought && (
                    <div className="mb-2 max-w-[85%] rounded-lg border border-purple-500/20 bg-purple-950/20 text-xs overflow-hidden">
                      <button
                        onClick={() => toggleThought(msg.id || idx)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-mono">Gedankengang (Reasoning)</span>
                        </div>
                        {expandedThoughts[msg.id || idx] ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {expandedThoughts[msg.id || idx] && (
                        <div className="p-3 border-t border-purple-500/20 text-slate-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                          {msg.thought}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Bubble or Inline Edit Textarea */}
                  {isEditing ? (
                    <div className="w-full max-w-[85%] space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full bg-slate-900 border border-purple-500 rounded-2xl p-3 text-sm text-slate-100 focus:outline-none resize-none"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Speichern</span>
                        </button>
                        <button
                          onClick={() => setEditingMsgId(null)}
                          className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Abbrechen</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative group/bubble max-w-[85%]">
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                            : 'bg-slate-900 border border-slate-800 text-slate-100 shadow-sm'
                        }`}
                      >
                        <RoleplayMessage content={msg.content} isUser={msg.role === 'user'} />
                      </div>

                      {/* Hover Action Buttons */}
                      <div
                        className={`absolute -bottom-3 ${
                          msg.role === 'user' ? 'right-2' : 'left-2'
                        } hidden group-hover/bubble:flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded-lg px-1.5 py-0.5 shadow-lg z-20 text-[10px] text-slate-400`}
                      >
                        {isAssistant && (
                          <>
                            <button
                              onClick={() => regenerateMessageSwipe(msg.id)}
                              disabled={isGenerating}
                              className="p-1 hover:text-purple-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                              title="Neu generieren (Neue Swipe-Variante anlegen)"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span className="hidden sm:inline">Swipe</span>
                            </button>
                            <button
                              onClick={() => continueChatMessage(msg.id)}
                              disabled={isGenerating}
                              className="p-1 hover:text-purple-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                              title="Fortsetzen (Nachricht weiter generieren)"
                            >
                              <FastForward className="w-3 h-3" />
                              <span className="hidden sm:inline">Weiter</span>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleStartEdit(msg.id, msg.content)}
                          className="p-1 hover:text-purple-300 transition-colors"
                          title="Nachricht bearbeiten"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Diese Nachricht wirklich löschen?')) {
                              deleteChatMessage(msg.id);
                            }
                          }}
                          className="p-1 hover:text-rose-400 transition-colors"
                          title="Nachricht löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Streaming Assistant Message */}
            {isGenerating && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    {activeCharacter?.card.data.name || 'OtakuSoul'} denkt nach...
                  </span>
                </div>

                {/* Live Streaming Reasoning Block */}
                {streamThought && (
                  <div className="mb-2 max-w-[85%] rounded-lg border border-purple-500/40 bg-purple-950/30 text-xs overflow-hidden animate-pulse">
                    <button
                      onClick={() => setShowCurrentThought(!showCurrentThought)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-purple-300"
                    >
                      <div className="flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        <span className="font-mono font-medium">Live Reasoning...</span>
                      </div>
                      {showCurrentThought ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {showCurrentThought && (
                      <div className="p-3 border-t border-purple-500/20 text-slate-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {streamThought}
                      </div>
                    )}
                  </div>
                )}

                {/* Live Streaming Text Bubble */}
                {streamText && (
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-slate-900 border border-purple-500/30 text-slate-100 shadow-md">
                    <RoleplayMessage content={streamText} isUser={false} />
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Schreibe eine Nachricht..."
                className="flex-1 bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none max-h-32 transition-colors"
                rows={1}
              />

              {isGenerating ? (
                <button
                  onClick={abortGeneration}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md flex items-center justify-center"
                  title="Generierung abbrechen"
                >
                  <Square className="w-4 h-4 fill-white" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-md flex items-center justify-center"
                  title="Nachricht senden"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
