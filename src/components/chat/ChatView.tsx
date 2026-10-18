import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { api } from '../../services/api';
import { gestureForReply } from '../../utils/avatarGestures';
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
  Wrench,
} from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { useAmbientSound } from '../../hooks/useAmbientSound';
import { audioPlayer, gainFromVoiceVolume } from '../../services/audioPlayer';
import { streamingTts } from '../../services/streamingTts';

import { CharacterVoiceModal } from '../voice/CharacterVoiceModal';
import { PromptLogModal } from './PromptLogModal';
import { useTranslation } from '../../i18n';
import { applyReplacements } from '../../utils/replyFilters';
import { chatSpeakers } from '../../utils/groupChat';
import type { CharacterProfile } from '../../types';
import { NEUTRAL_EMOTION } from '../../store/slices/avatarSlice';
import { GroupPortraits } from '../avatar/GroupPortraits';

/** The voice of whoever writes the running reply (a guest's own voice in a group chat). */
const speakerVoice = (state: ReturnType<typeof useAppStore.getState>) =>
  state.generationSpeakerId ? state.speakerVoices[state.generationSpeakerId] ?? null : state.activeVoiceConfig;
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
    expertMode,
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
    replyReplacements,
  } = useStoreFields(
    'messages', 'storedMessages', 'isGenerating', 'generationChatId', 'generationId', 'isChatLoading', 'chatLoadError', 'clearChat', 'selectedBackend', 'setSelectedBackend', 'expertMode',
    'serverStatus', 'activeCharacter', 'activePersona', 'loadPresetCharacters', 'chatSidebarOpen',
    'setChatSidebarOpen', 'chatSessions', 'activeChatId', 'autoTtsEnabled', 'setAutoTtsEnabled',
    'activeVoiceConfig', 'setActiveTab', 'replyReplacements',
  );

  const [streamText, setStreamText] = useState('');
  const [streamThought, setStreamThought] = useState('');
  const [showCurrentThought, setShowCurrentThought] = useState(true);
  const [showAvatar, setShowAvatar] = usePersistentFlag('otakusoul.chat.avatar', true);
  const [compact, setCompact] = usePersistentFlag('otakusoul.chat.compact', false);
  // Group chat: everyone as portraits, or (default) only who speaks or spoke last.
  const [showEveryone, setShowEveryone] = usePersistentFlag('otakusoul.chat.groupEveryone', false);
  const chatTools = useAppStore((s) => s.chatTools);
  const setChatTools = useAppStore((s) => s.setChatTools);
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
          const voiceConfig = speakerVoice(state);
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
          const voiceConfig = speakerVoice(state);
          if (state.autoTtsEnabled && voiceConfig && voiceConfig.engine !== 'disabled') {
            streamingTts.flush(data.full_text, voiceConfig);
          }

          // Trigger Phase 14 Emotion update for VRM & Live2D. In a group chat each character keeps
          // their own expression; the avatar on screen (the speaker) shows it and gestures.
          const speaker = state.generationSpeakerId;
          try {
            const detected = await api.classifyTextEmotion(data.full_text);
            const currentState = useAppStore.getState();
            if (isSubscribed && currentState.activeChatId === state.activeChatId) {
              currentState.setSpeakerEmotion(speaker, detected);
              // Only while this reply is still the latest one (a group round may have moved on).
              if (currentState.generationId === data.generation_id && currentState.generationSpeakerId === speaker) {
                currentState.setCurrentEmotion(detected);
                // Body motion: a roleplay action like *winkt* first, else the emotion.
                const gesture = gestureForReply(data.full_text, detected.vrm_expression);
                if (gesture) currentState.playAvatarGesture(gesture);
              }
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
  // A guest's reply in a group chat is read with the guest's voice; only the chat's own
  // character moves the avatar.
  const handleSpeak = useCallback(async (text: string, speakerId = '') => {
    const voice = speakerId ? await useAppStore.getState().loadSpeakerVoice(speakerId) : activeVoiceConfig;
    if (!voice || voice.engine === 'disabled') return;
    try {
      // Phase 14: update avatar emotion to match spoken message (the speaker's own in a group chat)
      api.classifyTextEmotion(text).then((res) => {
        const state = useAppStore.getState();
        state.setSpeakerEmotion(speakerId, res);
        if (state.generationSpeakerId === speakerId) state.setCurrentEmotion(res);
      }).catch(() => {});

      const audioUrl = await api.synthesizeSpeech(text, voice);
      await audioPlayer.playDataUrl(
        audioUrl,
        gainFromVoiceVolume(voice.volume),
        voice.output_device_id,
        voice.effects,
      );
    } catch (e) {
      console.error('Speech synthesis failed:', e);
    }
  }, [activeVoiceConfig]);

  const currentSession = chatSessions.find((s) => s.id === activeChatId);
  // Group chat: the avatar shows who speaks or spoke last (a guest who left falls back to the host).
  const generationSpeakerId = useAppStore((s) => s.generationSpeakerId);
  const availableCharacters = useAppStore((s) => s.availableCharacters);
  const speakers = chatSpeakers(activeCharacter, currentSession, availableCharacters);
  const shownSpeaker: { id: string; character: CharacterProfile | null } =
    speakers.find((s) => s.id === generationSpeakerId) ?? speakers[0] ?? { id: '', character: activeCharacter };
  // Switching to another speaker shows their last expression, not the previous one's.
  const shownSpeakerId = shownSpeaker.id;
  useEffect(() => {
    const state = useAppStore.getState();
    if (chatSpeakers(state.activeCharacter, state.chatSessions.find((s) => s.id === state.activeChatId), state.availableCharacters).length < 2) return;
    state.setCurrentEmotion(state.speakerEmotions[shownSpeakerId] ?? NEUTRAL_EMOTION);
  }, [shownSpeakerId]);
  // The expression follows the reply on screen, also without a new one: opening a chat (or the app),
  // switching a swipe, editing. A fresh reply sets it in `onLlmDone` (with a gesture).
  const lastReply = isGenerating || isChatLoading ? undefined : [...storedMessages].reverse().find((m) => m.role === 'assistant');
  const lastReplyKey = isGenerating || isChatLoading ? null : `${activeChatId}\n${lastReply?.speaker_id ?? ''}\n${lastReply?.content ?? ''}`;
  useEffect(() => {
    if (lastReplyKey === null) return;
    const chatId = useAppStore.getState().activeChatId;
    const text = lastReply?.content.trim();
    const speaker = lastReply?.speaker_id ?? '';
    if (!text) {
      useAppStore.getState().setCurrentEmotion(NEUTRAL_EMOTION);
      return;
    }
    let cancelled = false;
    api.classifyTextEmotion(text).then((res) => {
      const state = useAppStore.getState();
      if (cancelled || state.activeChatId !== chatId || state.isGenerating) return;
      state.setSpeakerEmotion(speaker, res);
      if (state.generationSpeakerId === speaker) state.setCurrentEmotion(res);
    }).catch(() => {});
    return () => { cancelled = true; };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the key holds chat, speaker and text
  }, [lastReplyKey]);
  const chatStyle = currentSession?.style;
  // The picture of the chat (Stage library), loaded once per file name.
  const [background, setBackground] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    const name = chatStyle?.background;
    if (!name) return;
    let cancelled = false;
    api
      .getStageBackgroundImage(name)
      .then((url) => !cancelled && setBackground({ name, url }))
      .catch((error: unknown) => console.warn('Chat background missing:', error));
    return () => {
      cancelled = true;
    };
  }, [chatStyle?.background]);
  const backgroundUrl = chatStyle?.background && background?.name === chatStyle.background ? background.url : null;
  const ambientVolume = (chatStyle?.ambient_volume ?? 0) / 100;
  useAmbientSound(chatStyle?.ambient, Boolean(chatStyle?.ambient) && ambientVolume > 0, ambientVolume);

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

          {/* Backend Selector (experts; the start page shows which AI answers) */}
          {expertMode && <div
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
          </div>}

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
          {showAvatar && speakers.length > 1 && (
            <button
              onClick={() => setShowEveryone(!showEveryone)}
              aria-pressed={showEveryone}
              aria-label={t('group.showEveryone')}
              className={`${TOOLBAR_TOGGLE} ${
                showEveryone
                  ? 'bg-accent-950/40 text-accent-300 border-accent-500/40'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
              }`}
              title={t('group.showEveryoneHint')}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('group.showEveryone')}</span>
            </button>
          )}

          {expertMode && (
          <button
            onClick={() => setChatTools(!chatTools)}
            aria-pressed={chatTools}
            aria-label={t('chat.tools')}
            className={`${TOOLBAR_TOGGLE} ${
              chatTools
                ? 'bg-accent-950/40 text-accent-300 border-accent-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
            }`}
            title={t('chat.toolsHint')}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t('chat.tools')}</span>
          </button>
          )}

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
              ...(expertMode ? [{ label: t('promptLog.open'), icon: FileText, onSelect: () => setShowPromptLog(true) }] : []),
              ...(activeChatId ? [{ label: t('chat.deleteSession'), icon: Trash2, onSelect: () => void handleClearSession() }] : []),
            ]}
          />
        </div>
      </div>

      {/* Adaptive HUD Bar */}
      <AdaptiveHud compact={compact} />

      {/* Main Split Layout: Avatar (Left) + Chat (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {showAvatar && activeCharacter && (
          <div className="hidden md:flex w-5/12 lg:w-1/3 h-full" data-avatar-speaker={shownSpeaker.id || 'host'}>
            {showEveryone && speakers.length > 1 ? (
              <GroupPortraits speakers={speakers} speakerId={shownSpeaker.id} isSpeaking={isAudioSpeaking} />
            ) : (
              <React.Suspense fallback={<AvatarSkeleton label={t('chat.avatarLoading')} />}>
                <AvatarCanvas
                  character={shownSpeaker.character}
                  isSpeaking={isAudioSpeaking}
                />
              </React.Suspense>
            )}
          </div>
        )}

        {/* Chat Area */}
        <div className="relative isolate flex-1 flex flex-col h-full overflow-hidden bg-app">
          {backgroundUrl && (
            <>
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url("${backgroundUrl}")` }} />
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-app" style={{ opacity: (chatStyle?.background_dim ?? 40) / 100 }} />
            </>
          )}
          <SceneImageCard />
          {showSearch && <ChatSearchBar messages={displayList} onClose={() => setShowSearch(false)} />}
          {/* Messages Stream Area */}
          <div
            ref={scrollRef}
            data-density={compact ? 'compact' : undefined}
            data-text-size={chatStyle?.text_size || undefined}
            data-bubbles={chatStyle?.bubbles || undefined}
            data-has-background={backgroundUrl ? '' : undefined}
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
                      content={applyReplacements(streamText, replyReplacements)} 
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
