import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { api } from '../../services/api';
import { AdaptiveHud } from './AdaptiveHud';
import { SceneImageCard } from './SceneImageCard';
import { RoleplayMessage } from './RoleplayMessage';
import { ChatSidebar } from './ChatSidebar';
import { MessageList } from './MessageList';
import { ChatComposer } from './ChatComposer';
import { ChatSearchBar } from './ChatSearchBar';
import {
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  Search,
  Trash2,
  Cpu,
  Cloud,
  Eye,
  EyeOff,
  MessageSquare,
  MessageCircle,
  Settings,
  Users,
  PlugZap,
  Volume2,
  VolumeX,
  Rows3,
  MoreHorizontal,
  FileText,
} from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { audioPlayer, gainFromVoiceVolume } from '../../services/audioPlayer';
import { streamingTts } from '../../services/streamingTts';

import { CharacterVoiceModal } from '../voice/CharacterVoiceModal';
import { PromptLogModal } from './PromptLogModal';
import { useTranslation } from '../../i18n';
import { EmptyState } from '../ui/EmptyState';
import { AvatarSkeleton } from '../ui';

const AvatarCanvas = React.lazy(() => import('../avatar/AvatarCanvas').then((module) => ({
  default: module.AvatarCanvas,
})));

const TOOLBAR_TOGGLE =
  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

export const ChatView: React.FC = () => {
  const { t } = useTranslation();
  const {
    messages,
    storedMessages,
    isGenerating,
    generationChatId,
    generationId,
    isChatLoading,
    chatLoadError,
    clearChat,
    selectedBackend,
    setSelectedBackend,
    serverStatus,
    activeCharacter,
    activePersona,
    loadPresetCharacters,
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSessions,
    activeChatId,
    autoTtsEnabled,
    setAutoTtsEnabled,
    activeVoiceConfig,
    setActiveTab,
  } = useStoreFields(
    'messages', 'storedMessages', 'isGenerating', 'generationChatId', 'generationId', 'isChatLoading', 'chatLoadError', 'clearChat', 'selectedBackend', 'setSelectedBackend',
    'serverStatus', 'activeCharacter', 'activePersona', 'loadPresetCharacters', 'chatSidebarOpen',
    'setChatSidebarOpen', 'chatSessions', 'activeChatId', 'autoTtsEnabled', 'setAutoTtsEnabled',
    'activeVoiceConfig', 'setActiveTab',
  );

  const [streamText, setStreamText] = useState('');
  const [streamThought, setStreamThought] = useState('');
  const [showCurrentThought, setShowCurrentThought] = useState(true);
  const [showAvatar, setShowAvatar] = usePersistentFlag('otakusoul.chat.avatar', true);
  const [compact, setCompact] = usePersistentFlag('otakusoul.chat.compact', false);
  const [showSearch, setShowSearch] = useState(false);
  const chatJumpTarget = useAppStore((s) => s.chatJumpTarget);

  // Ctrl+F searches the open chat instead of the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showPromptLog, setShowPromptLog] = useState(false);
  const [isAudioSpeaking, setIsAudioSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPresetCharacters();
  }, [loadPresetCharacters]);

  // Setup live streaming listeners with bulletproof subscription lifecycle
  useEffect(() => {
    let isSubscribed = true;
    const cleanups: (() => void)[] = [];

    const acceptsStream = (id: string) => {
      const state = useAppStore.getState();
      return isSubscribed && state.isGenerating && state.generationChatId === state.activeChatId && !!id && state.generationId === id;
    };
    const setup = async () => {
      const uToken = await api.onLlmToken((token) => {
        if (acceptsStream(token.generation_id)) {
          setStreamText((prev) => prev + token.text);
          const state = useAppStore.getState();
          const voiceConfig = state.activeVoiceConfig;
          if (state.autoTtsEnabled && voiceConfig && voiceConfig.engine !== 'disabled') {
            streamingTts.push(token.text, voiceConfig);
          }
        }
      });
      if (!isSubscribed) {
        uToken();
      } else {
        cleanups.push(uToken);
      }

      const uThought = await api.onLlmThought((thought) => {
        if (acceptsStream(thought.generation_id)) setStreamThought((prev) => prev + thought.text);
      });
      if (!isSubscribed) {
        uThought();
      } else {
        cleanups.push(uThought);
      }

      const uDone = await api.onLlmDone(async (data) => {
        if (acceptsStream(data.generation_id)) {
          setStreamText('');
          setStreamThought('');
          
          const state = useAppStore.getState();
          const voiceConfig = state.activeVoiceConfig;
          if (state.autoTtsEnabled && voiceConfig && voiceConfig.engine !== 'disabled') {
            streamingTts.flush(data.full_text, voiceConfig);
          }

          // Trigger Phase 14 Emotion update for VRM & Live2D
          try {
            const detected = await api.classifyTextEmotion(data.full_text);
            const currentState = useAppStore.getState();
            if (isSubscribed && currentState.generationId === data.generation_id && currentState.activeChatId === state.activeChatId) {
              currentState.setCurrentEmotion(detected);
            }
          } catch (e) {
            console.warn('Emotion classification failed:', e);
          }
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
      streamingTts.cancel();
    };
  }, []);

  // Reset the buffer fed by native events when its generation/session changes.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setStreamText('');
    setStreamThought('');
  }, [isGenerating, activeChatId, generationChatId, generationId]);

  useEffect(() => audioPlayer.onPlaybackState((state) => {
    setIsAudioSpeaking(state === 'playing');
  }), []);

  // New messages scroll the message list; the live reply below it scrolls here.
  useEffect(() => {
    if (streamText || streamThought) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText, streamThought]);

  // No confirmation: the toast offers "Undo" for a few seconds.
  const handleClearSession = () => void clearChat();

  const canSpeak = !!activeVoiceConfig && activeVoiceConfig.engine !== 'disabled';
  const handleSpeak = useCallback(async (text: string) => {
    if (!activeVoiceConfig) return;
    try {
      // Phase 14: update avatar emotion to match spoken message
      api.classifyTextEmotion(text).then((res) => {
        useAppStore.getState().setCurrentEmotion(res);
      }).catch(() => {});

      const audioUrl = await api.synthesizeSpeech(text, activeVoiceConfig);
      await audioPlayer.playDataUrl(
        audioUrl,
        gainFromVoiceVolume(activeVoiceConfig.volume),
        activeVoiceConfig.output_device_id,
      );
    } catch (e) {
      console.error('Speech synthesis failed:', e);
    }
  }, [activeVoiceConfig]);

  const currentSession = chatSessions.find((s) => s.id === activeChatId);

  // Render storedMessages if available, otherwise flat fallback
  const displayList = useMemo(() => storedMessages.length > 0 ? storedMessages : messages.map((m, i) => ({
    id: `temp_${i}`,
    chat_id: activeChatId || 'default',
    role: m.role,
    content: m.content,
    thought: m.thought,
    order_index: i,
    swipe_index: 0,
    swipes: [{ content: m.content, thought: m.thought }],
    created_at: 0,
    attachments: m.attachments ?? [],
  })), [storedMessages, messages, activeChatId]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-app overflow-hidden relative">
      {/* Slide-out Chat Sidebar */}
      <ChatSidebar isOpen={chatSidebarOpen} onClose={() => setChatSidebarOpen(false)} />

      {/* Top Chat Bar: Backend Switcher, Session Info & Actions */}
      <div className="h-11 border-b border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          {/* Chat Sessions Sidebar Toggle */}
          <button
            onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
            aria-expanded={chatSidebarOpen}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              chatSidebarOpen
                ? 'bg-accent-600/30 text-accent-300 border-accent-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:text-white hover:bg-slate-700/80'
            }`}
            title={t('chat.sessionsTooltip')}
          >
            <MessageSquare className="w-3.5 h-3.5 text-accent-400" />
            <span className="font-semibold max-w-40 truncate">{currentSession?.title || t('chat.sessions')}</span>
          </button>

          {/* Backend Selector */}
          <div
            role="group"
            aria-label={t('chat.backendLabel')}
            className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs font-medium"
          >
            <button
              onClick={() => setSelectedBackend('local')}
              aria-pressed={selectedBackend === 'local'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                selectedBackend === 'local'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('chat.localLlm')}</span>
            </button>
            <button
              onClick={() => setSelectedBackend('cloud')}
              aria-pressed={selectedBackend === 'cloud'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                selectedBackend === 'cloud'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t('chat.cloudApi')}</span>
            </button>
          </div>

          {selectedBackend === 'local' && serverStatus.state !== 'running' && (
            <button
              onClick={() => setActiveTab('settings')}
              title={t('chat.openSettings')}
              className="hidden lg:flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md whitespace-nowrap hover:bg-amber-500/20 outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <PlugZap className="w-3.5 h-3.5" />
              {t('chat.serverOffline')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch((open) => !open)}
            aria-pressed={showSearch}
            className={`${TOOLBAR_TOGGLE} bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200`}
            title={t('chat.searchTooltip')}
            aria-label={t('chat.search')}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          {activeVoiceConfig && activeVoiceConfig.engine !== 'disabled' && (
            <button
              onClick={() => {
                const enabled = !autoTtsEnabled;
                setAutoTtsEnabled(enabled);
                if (!enabled) streamingTts.cancel();
              }}
              aria-pressed={autoTtsEnabled}
              className={`${TOOLBAR_TOGGLE} ${
                autoTtsEnabled
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
              }`}
              title={autoTtsEnabled ? t('chat.autoTtsOn') : t('chat.autoTtsOff')}
              aria-label={t('chat.autoTts')}
            >
              {autoTtsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden xl:inline">{t('chat.autoTts')}</span>
            </button>
          )}
          <button
            onClick={() => setShowAvatar(!showAvatar)}
            aria-pressed={showAvatar}
            aria-label={t('chat.avatar')}
            className={`${TOOLBAR_TOGGLE} ${
              showAvatar
                ? 'bg-accent-950/40 text-accent-300 border-accent-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
            }`}
            title={showAvatar ? t('chat.hideAvatar') : t('chat.showAvatar')}
          >
            {showAvatar ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline">{t('chat.avatar')}</span>
          </button>

          <button
            onClick={() => setCompact(!compact)}
            aria-pressed={compact}
            aria-label={t('chat.compact')}
            className={`${TOOLBAR_TOGGLE} ${
              compact
                ? 'bg-accent-950/40 text-accent-300 border-accent-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
            }`}
            title={t('chat.compactHint')}
          >
            <Rows3 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('chat.compact')}</span>
          </button>

          {/* Rarely used actions stay out of the way. */}
          <DropdownMenu
            triggerLabel={t('chat.moreActions')}
            triggerClassName={`${TOOLBAR_TOGGLE} bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200`}
            trigger={<MoreHorizontal className="w-3.5 h-3.5" />}
            items={[
              { label: t('chat.voiceTooltip'), icon: Volume2, onSelect: () => setShowVoiceModal(true) },
              { label: t('promptLog.open'), icon: FileText, onSelect: () => setShowPromptLog(true) },
              ...(activeChatId ? [{ label: t('chat.deleteSession'), icon: Trash2, onSelect: () => void handleClearSession() }] : []),
            ]}
          />
        </div>
      </div>

      {/* Adaptive HUD Bar */}
      <AdaptiveHud compact={compact} />

      {/* Main Split Layout: Avatar (Left) + Chat (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {showAvatar && (
          <div className="hidden md:flex w-5/12 lg:w-1/3 h-full">
            <React.Suspense fallback={<AvatarSkeleton label={t('chat.avatarLoading')} />}>
              <AvatarCanvas
                character={activeCharacter}
                isSpeaking={isAudioSpeaking}
              />
            </React.Suspense>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-app">
          <SceneImageCard />
          {showSearch && <ChatSearchBar messages={displayList} onClose={() => setShowSearch(false)} />}
          {/* Messages Stream Area */}
          <div
            ref={scrollRef}
            data-density={compact ? 'compact' : undefined}
            className={`flex-1 overflow-y-auto select-text ${compact ? 'px-3 py-2 space-y-2' : 'p-4 space-y-4'}`}
            aria-live="polite"
          >
            {displayList.length === 0 && !isGenerating && !isChatLoading && !chatLoadError && (
              !activeCharacter ? (
                <EmptyState
                  icon={Users}
                  title={t('chat.noCharacterTitle')}
                  description={t('chat.noCharacterText')}
                  className="h-full"
                  actions={
                    <button
                      onClick={() => setActiveTab('characters')}
                      className="px-3.5 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Users className="w-4 h-4" />
                      {t('chat.toLibrary')}
                    </button>
                  }
                />
              ) : selectedBackend === 'local' && serverStatus.state !== 'running' ? (
                <EmptyState
                  icon={PlugZap}
                  title={t('chat.serverOfflineTitle')}
                  description={t('chat.serverOfflineText', { name: activeCharacter.card.data.name })}
                  className="h-full"
                  actions={
                    <>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="px-3.5 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Settings className="w-4 h-4" />
                        {t('chat.openSettings')}
                      </button>
                      <button
                        onClick={() => setSelectedBackend('cloud')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        {t('chat.useCloud')}
                      </button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={MessageCircle}
                  title={t('chat.startTitle')}
                  description={t('chat.startText', { name: activeCharacter.card.data.name })}
                  className="h-full"
                />
              )
            )}
            <MessageList
              messages={displayList}
              scrollRef={scrollRef}
              characterName={activeCharacter?.card.data.name || 'OtakuSoul'}
              persona={activePersona}
              isGenerating={isGenerating}
              onSpeak={canSpeak ? handleSpeak : undefined}
              jumpTo={chatJumpTarget}
            />

            {/* Live Streaming Assistant Message */}
            {isGenerating && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-xs font-semibold text-accent-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    {t('chat.thinking', { name: activeCharacter?.card.data.name || 'OtakuSoul' })}
                  </span>
                </div>

                {/* Live Streaming Reasoning Block */}
                {streamThought && (
                  <div className="mb-2 max-w-[85%] rounded-lg border border-accent-500/40 bg-accent-950/30 text-xs overflow-hidden animate-pulse">
                    <button
                      onClick={() => setShowCurrentThought(!showCurrentThought)}
                      aria-expanded={showCurrentThought}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-accent-300"
                    >
                      <div className="flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-accent-400 animate-pulse" />
                        <span className="font-mono font-medium">{t('chat.liveReasoning')}</span>
                      </div>
                      {showCurrentThought ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {showCurrentThought && (
                      <div className="p-3 border-t border-accent-500/20 text-slate-300 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {streamThought}
                      </div>
                    )}
                  </div>
                )}

                {/* Live Streaming Text Bubble */}
                {streamText && (
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-slate-900 border border-accent-500/30 text-slate-100 shadow-md">
                    <RoleplayMessage 
                      content={streamText} 
                      isUser={false} 
                      onSpeak={activeVoiceConfig?.engine !== 'disabled' ? () => handleSpeak(streamText) : undefined}
                    />
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatComposer />
        </div>
      </div>
      {showVoiceModal && (
        <CharacterVoiceModal onClose={() => setShowVoiceModal(false)} />
      )}
      {showPromptLog && <PromptLogModal onClose={() => setShowPromptLog(false)} />}
    </div>
  );
};
