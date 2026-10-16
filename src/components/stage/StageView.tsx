import React, { useEffect, useState } from 'react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { ClockWidget } from './ClockWidget';
import { DiceRoller } from './DiceRoller';
import { EncounterTracker } from './EncounterTracker';
import { Combat5ePanel } from './Combat5ePanel';
import { StageBoardView } from './StageBoardView';
import { PartyHeader } from './PartyHeader';
import { StageChatLog } from './StageChatLog';
import { TurnControlBar } from './TurnControlBar';
import { SceneLobbyModal, type LobbyRules } from './SceneLobbyModal';
import { SceneCreateModal } from './SceneCreateModal';
import { StoryGallery } from './StoryGallery';
import { StoryWizard } from './StoryWizard';
import { DropdownMenu } from '../ui/DropdownMenu';
import { useStageAmbient } from './useStageAmbient';
import { CharacterVoiceModal } from '../voice/CharacterVoiceModal';
import { STAGE_NARRATOR_VOICE_ID } from '../../services/stageVoice';
import { StageCampaignPanel } from './StageCampaignPanel';
import { soundFx } from '../../services/soundFx';
import {
  Compass,
  Volume2,
  VolumeX,
  Flame,
  Plus,
  Edit3,
  Check,
  Radio,
  Download,
  Scroll,
  Swords,
  BookOpen,
  MapPin,
  Backpack,
  LoaderCircle,
  UserRound,
  Lock,
  Unlock,
  ImagePlus,
  AudioLines,
  Mic,
  Map as MapIcon,
  MoreHorizontal,
} from 'lucide-react';
import { api } from '../../services/api';
import { SceneState } from '../../types';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import { languageCode, localizeSceneHeader } from '../../utils/cardI18n';

export const StageView: React.FC = () => {
  const { t } = useTranslation();
  const {
    stageState,
    fetchStageState,
    saveStageScene,
    updateWorldState,
    setClockProgress,
    addClock,
    deleteClock,
    exportStageMarkdown,
    isProcessingStageTurn,
    generateSceneImage,
    isGeneratingSceneImage,
    stageReadAloud,
    setStageReadAloud,
    setSelectedStageFolder,
    restoreStageScene,
    stageLastScene,
    loadStageScene,
    fetchStageScenes,
    replyLanguage,
  } = useStoreFields(
    'stageState', 'fetchStageState', 'saveStageScene', 'updateWorldState', 'setClockProgress',
    'addClock', 'deleteClock', 'exportStageMarkdown', 'isProcessingStageTurn',
    'generateSceneImage', 'isGeneratingSceneImage', 'stageReadAloud', 'setStageReadAloud', 'setSelectedStageFolder',
    'restoreStageScene', 'stageLastScene', 'loadStageScene', 'fetchStageScenes', 'replyLanguage',
  );
  // Gallery (choose a story) or the running story; decided once the remembered scene is restored.
  const [view, setView] = useState<'loading' | 'gallery' | 'play'>('loading');
  // Scene shown when the gallery opened: a scene loaded from the lobby switches to playing.
  const [galleryFrom, setGalleryFrom] = useState<string | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [showStoryWizard, setShowStoryWizard] = useState(false);
  const openGallery = () => {
    setGalleryFrom(stageState?.definition.id ?? null);
    setView('gallery');
  };

  const [activeTab, setActiveTab] = useState<'adventure' | 'board' | 'tactics' | 'campaign'>('adventure');
  // The board tab exists in 5e scenes with a map; a fight on a map opens it.
  const hasBoard = stageState?.definition.rules?.ruleset === '5e' && (!!stageState.map || !!stageState.definition.rules.map_id);
  const boardFightKey = hasBoard && stageState?.combat.is_active ? `${stageState.definition.id}:${stageState.map?.id}` : '';
  const [shownBoardFight, setShownBoardFight] = useState('');
  if (boardFightKey && boardFightKey !== shownBoardFight) {
    setShownBoardFight(boardFightKey);
    setActiveTab('board');
  } else if (!boardFightKey && shownBoardFight) {
    setShownBoardFight('');
  }
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [lobbyRules, setLobbyRules] = useState<LobbyRules>('all');

  const [isEditingWorld, setIsEditingWorld] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [weatherInput, setWeatherInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [dangerInput, setDangerInput] = useState(2);
  const [questInput, setQuestInput] = useState('');

  // Dynamic Background Image
  const [loadedBackground, setLoadedBackground] = useState<{ name: string; url: string | null } | null>(null);
  const activeBgName = stageState?.current_bg || stageState?.definition.starting_bg;
  const bgDataUrl = activeBgName && loadedBackground?.name === activeBgName ? loadedBackground.url : null;

  useEffect(() => {
    if (!activeBgName || activeBgName.toLowerCase() === 'none' || activeBgName.trim() === '') return;
    let isMounted = true;
    api.getStageBackgroundImage(activeBgName)
      .then((url) => {
        if (isMounted) setLoadedBackground({ name: activeBgName, url: url || null });
      })
      .catch(() => {
        if (isMounted) setLoadedBackground({ name: activeBgName, url: null });
      });
    return () => {
      isMounted = false;
    };
  }, [activeBgName]);

  const handleGenerateBackground = async () => {
    try {
      const res = await generateSceneImage('stage');
      if (res) toast.success(translate('stage.bgGenerated'));
    } catch (e) {
      toast.error(translate('hud.imageFailed', { error: errorMessage(e) }));
    }
  };

  const handleToggleLockBg = async () => {
    if (!stageState) return;
    const currentLock = !!stageState.definition.lock_bg;
    const updatedState: SceneState = {
      ...stageState,
      definition: {
        ...stageState.definition,
        lock_bg: !currentLock,
      },
    };
    try {
      await saveStageScene(updatedState);
    } catch (e) {
      toast.error(translate('stage.saveFailed', { error: errorMessage(e) }));
    }
  };

  // Audio Ambiance state: the scene's sound file if it has one, else the synthesized campfire.
  const [isAmbianceActive, setIsAmbianceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(soundFx.getIsMuted());
  const [ambientWanted, setAmbientWanted] = useState(true);
  const [showNarratorVoice, setShowNarratorVoice] = useState(false);
  const sceneAmbient = stageState?.definition.disable_ambient ? null : stageState?.current_ambient;
  const ambientOn = sceneAmbient ? ambientWanted && !isMuted : isAmbianceActive;
  useStageAmbient(sceneAmbient, ambientWanted && !isMuted);
  /* oxlint-disable react/set-state-in-effect -- the synthesized campfire is an external audio source. */
  useEffect(() => {
    // A scene sound replaces the synthesized campfire.
    if (sceneAmbient && isAmbianceActive) {
      soundFx.stopAmbiance();
      setIsAmbianceActive(false);
    }
  }, [sceneAmbient, isAmbianceActive]);
  /* oxlint-enable react/set-state-in-effect */

  // New Clock Modal
  const [showClockModal, setShowClockModal] = useState(false);
  const [newClockName, setNewClockName] = useState(() => translate('stage.clockNameDefault'));
  const [newClockMax, setNewClockMax] = useState(6);
  const [newClockType, setNewClockType] = useState<'danger' | 'progress' | 'mystery'>('danger');

  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchStageState();
      const restored = await restoreStageScene();
      if (!active) return;
      if (restored) setView('play');
      else {
        setGalleryFrom(useAppStore.getState().stageState?.definition.id ?? null);
        setView('gallery');
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchStageState, restoreStageScene]);

  const handleToggleWorldEditor = () => {
    if (!isEditingWorld && stageState?.world) {
      setLocationInput(stageState.world.location);
      setWeatherInput(stageState.world.weather);
      setTimeInput(stageState.world.time_of_day);
      setDangerInput(stageState.world.danger_level);
      setQuestInput(stageState.world.active_quest);
    }
    setIsEditingWorld((current) => !current);
  };

  const handleSaveWorld = () => {
    updateWorldState({
      location: locationInput.trim(),
      weather: weatherInput.trim(),
      time_of_day: timeInput.trim(),
      danger_level: dangerInput,
      active_quest: questInput.trim(),
      key_facts: stageState?.world.key_facts || {},
    });
    setIsEditingWorld(false);
  };

  const handleToggleAmbiance = () => {
    if (sceneAmbient) {
      setAmbientWanted((on) => !on);
      return;
    }
    const active = soundFx.toggleCampfireAmbiance();
    setIsAmbianceActive(active);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    soundFx.setMuted(nextMute);
    setIsMuted(nextMute);
    if (nextMute) {
      setIsAmbianceActive(false);
    }
  };

  const handleCreateClock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClockName.trim()) return;
    addClock({
      id: `clock_${Date.now()}`,
      name: newClockName.trim(),
      current: 0,
      max: newClockMax,
      clock_type: newClockType,
    });
    setShowClockModal(false);
    setNewClockName('');
  };

  const handleExportMarkdown = async () => {
    if (!stageState) return;
    const md = await exportStageMarkdown(stageState.definition.id);
    if (md) {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${stageState.definition.title.toLowerCase().replace(/\s+/g, '_')}_abenteuer.md`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const world = stageState?.world;
  const currentScene = stageState?.definition;
  const header = currentScene ? localizeSceneHeader(currentScene, languageCode(replyLanguage)) : null;

  const closeLobby = () => {
    setShowLobbyModal(false);
    if (view === 'gallery' && useAppStore.getState().stageState?.definition.id !== galleryFrom) setView('play');
  };

  if (view !== 'play') {
    return (
      <div className="flex-1 flex flex-col h-full bg-app overflow-hidden relative">
        {view === 'gallery' && (
          <StoryGallery
            onPlay={() => setView('play')}
            onManage={() => {
              setLobbyRules('all');
              setShowLobbyModal(true);
            }}
            onCreate={() => setShowStoryWizard(true)}
            onBack={stageLastScene ? () => setView('play') : undefined}
          />
        )}
        {showStoryWizard && (
          <StoryWizard
            onClose={() => setShowStoryWizard(false)}
            onCreated={() => {
              setShowStoryWizard(false);
              void fetchStageScenes();
              setView('play');
            }}
            onAdvanced={() => {
              setShowStoryWizard(false);
              setShowCreateStory(true);
            }}
          />
        )}
        {showCreateStory && (
          <SceneCreateModal
            isOpen
            onClose={() => setShowCreateStory(false)}
            onCreated={(created) => {
              void fetchStageScenes();
              void loadStageScene(created.id).then(() => setView('play'));
            }}
          />
        )}
        <SceneLobbyModal isOpen={showLobbyModal} onClose={closeLobby} initialRules={lobbyRules} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden relative">
      {/* Dynamic Background Image Layer with atmospheric tint */}
      {bgDataUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 pointer-events-none z-0"
          style={{ backgroundImage: `url(${bgDataUrl})` }}
        >
          <div className="absolute inset-0 bg-app/85 backdrop-blur-[2px]" />
        </div>
      )}

      {/* 1. Universal Top Header Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md z-10 backdrop-blur-md">
        {/* Left: Active Scene & Location Info */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
            <Compass className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 truncate max-w-[220px] sm:max-w-md">
                {header?.title || t('stage.defaultTitle')}
              </h2>
              {header?.gm_tone && (
                <span className="text-[11px] px-2 py-0.2 rounded-full bg-accent-950/80 border border-accent-500/30 text-accent-300 font-mono">
                  {header.gm_tone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 truncate max-w-[180px]">
                <MapPin className="w-3 h-3 text-slate-400" />
                {world?.location || currentScene?.starting_location || t('stage.unknownLocation')}
              </span>
              <span>•</span>
              <span className="text-accent-300">
                {world?.time_of_day || currentScene?.time_of_day || t('stage.defaultTime')}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Tabs Switcher (Adventure vs Tactics) */}
        <div role="tablist" aria-label={t('stage.views')} className="flex items-center gap-1 p-1 rounded-xl bg-app/80 border border-slate-800 text-xs">
          <button
            role="tab"
            aria-selected={activeTab === 'adventure'}
            onClick={() => setActiveTab('adventure')}
            title={t('stage.tabAdventureHint')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'adventure'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scroll className="w-3.5 h-3.5" />
            <span>{t('stage.tabAdventure')}</span>
          </button>

          {hasBoard && (
            <button
              role="tab"
              aria-selected={activeTab === 'board'}
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                activeTab === 'board'
                  ? 'bg-accent-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>{t('board.tab')}</span>
            </button>
          )}

          <button
            role="tab"
            aria-selected={activeTab === 'tactics'}
            onClick={() => setActiveTab('tactics')}
            title={t('stage.tabTacticsHint')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'tactics'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>{t('stage.tabTactics')}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'campaign'}
            onClick={() => setActiveTab('campaign')}
            title={t('stage.tabCampaignHint')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'campaign'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Backpack className="w-3.5 h-3.5" />
            <span>{t('stage.tabCampaign')}</span>
          </button>
        </div>

        {/* Right: Scene Lobby, Export & Ambiance Controls */}
        <div className="flex items-center gap-2">
          <div
            className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
              isProcessingStageTurn
                ? 'bg-accent-950/60 border-accent-500/40 text-accent-200'
                : 'bg-app border-slate-700 text-slate-300'
            }`}
            title={t('stage.currentTurn')}
            aria-live="polite"
          >
            {isProcessingStageTurn ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <UserRound className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="max-w-32 truncate">
              {isProcessingStageTurn
                ? t('stage.gmPlanning')
                : !stageState?.current_turn_actor || stageState.current_turn_actor === 'PLAYER'
                  ? t('stage.yourTurn')
                  : t('stage.actorTurn', { name: stageState.current_turn_actor })}
            </span>
          </div>

          <button
            onClick={openGallery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-600/20 hover:bg-accent-600/30 text-accent-300 text-xs font-semibold border border-accent-500/30 transition"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('stage.stories')}</span>
          </button>

          <button
            data-testid="open-5e-adventures"
            onClick={() => {
              // 5e adventures are looked for in every folder.
              setSelectedStageFolder('Alle');
              setLobbyRules('5e');
              setShowLobbyModal(true);
            }}
            title={t('stage.adventuresHint')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 text-xs font-semibold border border-rose-500/40 transition"
          >
            <Swords className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('stage.adventures')}</span>
          </button>

          <DropdownMenu
            triggerLabel={t('stage.moreActions')}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
            trigger={
              <>
                {isGeneratingSceneImage ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{t('stage.more')}</span>
              </>
            }
            items={[
              {
                label: isGeneratingSceneImage ? t('hud.generatingImage') : t('stage.menuGenerateBg'),
                description: t('stage.generateBg'),
                icon: ImagePlus,
                onSelect: () => {
                  if (!isGeneratingSceneImage && stageState) void handleGenerateBackground();
                },
              },
              {
                label: stageState?.definition.lock_bg ? t('stage.menuUnlockBg') : t('stage.menuLockBg'),
                description: stageState?.definition.lock_bg ? t('stage.bgLocked') : t('stage.bgDynamic'),
                icon: stageState?.definition.lock_bg ? Unlock : Lock,
                onSelect: () => void handleToggleLockBg(),
              },
              {
                label: t('stage.narratorVoice'),
                description: t('stage.narratorVoiceHint'),
                icon: Mic,
                onSelect: () => setShowNarratorVoice(true),
              },
              {
                label: t('stage.menuExport'),
                description: t('stage.exportMd'),
                icon: Download,
                onSelect: () => void handleExportMarkdown(),
              },
            ]}
          />

          {/* Sound Synthesizer Controls */}
          <button
            onClick={handleToggleAmbiance}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              ambientOn
                ? 'bg-amber-600/30 text-amber-200 border-amber-500/50 shadow-md shadow-amber-950/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title={sceneAmbient ? t('stage.ambientFile', { name: sceneAmbient }) : t('stage.ambianceToggle')}
            aria-pressed={ambientOn}
          >
            <Radio className={`w-3.5 h-3.5 ${ambientOn ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {ambientOn ? t(sceneAmbient ? 'stage.ambientOn' : 'stage.ambianceOn') : t('stage.ambiance')}
            </span>
          </button>

          <button
            onClick={() => setStageReadAloud(!stageReadAloud)}
            aria-pressed={stageReadAloud}
            title={t('stage.readAloudHint')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              stageReadAloud
                ? 'bg-accent-600/30 text-accent-200 border-accent-500/50'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <AudioLines className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('stage.readAloud')}</span>
          </button>

          <button
            onClick={handleToggleMute}
            className={`p-2 rounded-xl border transition ${
              isMuted
                ? 'bg-rose-950/40 text-rose-400 border-rose-500/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title={isMuted ? t('stage.unmute') : t('stage.mute')}
            aria-label={isMuted ? t('stage.unmute') : t('stage.mute')}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Main Body: Switchable Tab Views */}
      {activeTab === 'adventure' ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Party Header Bar with HP & Stress */}
          <PartyHeader />

          {/* Interactive Chat Log */}
          <StageChatLog />

          {/* 5e fight: order, actions and log (engine-driven) */}
          <Combat5ePanel />

          {/* Turn Control Bar (Mode switcher, choice pills, inputs) */}
          <TurnControlBar />
        </div>
      ) : activeTab === 'board' && hasBoard ? (
        <StageBoardView />
      ) : activeTab === 'tactics' ? (
        /* Tactical Overview: Clocks, Dice & Encounters */
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
          {/* World & Atmosphere Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-linear-to-r from-slate-900/90 via-accent-950/20 to-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur relative">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  {t('stage.worldTitle')}
                </h3>
                <p className="text-xs text-slate-400">{t('stage.worldIntro')}</p>
              </div>

              <button
                onClick={handleToggleWorldEditor}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title={t('stage.editWorld')}
                aria-label={t('stage.editWorld')}
                aria-expanded={isEditingWorld}
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            {/* World State Display or Edit */}
            {!isEditingWorld ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-app/50 border border-slate-800/60">
                  <span className="text-xs text-slate-400 block mb-0.5">{t('stage.currentLocation')}</span>
                  <span className="font-bold text-slate-200 line-clamp-1">
                    {world?.location || t('stage.unknown')}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-app/50 border border-slate-800/60">
                  <span className="text-xs text-slate-400 block mb-0.5">{t('stage.timeWeather')}</span>
                  <span className="font-bold text-accent-200 line-clamp-1">
                    {world?.time_of_day} • {world?.weather}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-app/50 border border-slate-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block mb-0.5">{t('stage.dangerLevel')}</span>
                    <span className="font-bold text-slate-200">{t('stage.dangerValue', { level: world?.danger_level ?? 1 })}</span>
                  </div>
                  <div className="flex gap-1 text-amber-500">
                    {Array.from({ length: world?.danger_level || 1 }).map((_, i) => (
                      <Flame key={i} className="w-3.5 h-3.5 fill-amber-500/40" />
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-app/50 border border-slate-800/60 sm:col-span-2 lg:col-span-1">
                  <span className="text-xs text-slate-400 block mb-0.5">{t('stage.currentQuest')}</span>
                  <span className="font-semibold text-slate-300 line-clamp-1">
                    {world?.active_quest}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-app/80 border border-accent-500/40 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="world-location" className="text-xs text-slate-400 block mb-1">{t('stage.location')}</label>
                    <input
                      id="world-location"
                      type="text"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="world-time" className="text-xs text-slate-400 block mb-1">{t('stage.timeOfDay')}</label>
                    <input
                      id="world-time"
                      type="text"
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="world-weather" className="text-xs text-slate-400 block mb-1">{t('stage.weather')}</label>
                    <input
                      id="world-weather"
                      type="text"
                      value={weatherInput}
                      onChange={(e) => setWeatherInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="world-quest" className="text-xs text-slate-400 block mb-1">{t('stage.quest')}</label>
                    <input
                      id="world-quest"
                      type="text"
                      value={questInput}
                      onChange={(e) => setQuestInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="world-danger" className="text-xs text-slate-400 block mb-1">
                      {t('stage.dangerInput')}
                    </label>
                    <input
                      id="world-danger"
                      type="number"
                      min={1}
                      max={5}
                      value={dangerInput}
                      onChange={(e) => setDangerInput(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsEditingWorld(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSaveWorld}
                    className="px-4 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('stage.apply')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Clocks & Dice Roller */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{t('stage.clocksTitle')}</h3>
                  <p className="text-xs text-slate-400">{t('stage.clocksIntro')}</p>
                </div>
                <button
                  onClick={() => setShowClockModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-accent-600/30 hover:bg-accent-600/50 text-accent-200 text-xs font-semibold flex items-center gap-1.5 border border-accent-500/40 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('stage.newClock')}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stageState?.clocks.map((clock) => (
                  <ClockWidget
                    key={clock.id}
                    clock={clock}
                    onUpdateProgress={(id, val) => setClockProgress(id, val)}
                    onDelete={async (id) => {
                      const confirmed = await confirmDialog({
                        title: translate('confirm.deleteClockTitle', { name: clock.name }),
                        confirmLabel: translate('common.delete'),
                        tone: 'danger',
                      });
                      if (confirmed) deleteClock(id);
                    }}
                  />
                ))}

                {(!stageState?.clocks || stageState.clocks.length === 0) && (
                  <div className="col-span-full p-8 text-center text-xs text-slate-400 italic">
                    {t('stage.noClocks')}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Dice Roller Station */}
            <DiceRoller />
          </div>

          {/* Tactical Combat Encounter */}
          <EncounterTracker />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <StageCampaignPanel />
        </div>
      )}

      {/* Modal: New Clock */}
      {showClockModal && (
        <ModalOverlay onClose={() => setShowClockModal(false)} aria-labelledby="new-clock-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateClock}
            className="w-full max-w-sm p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-3"
          >
            <h4 id="new-clock-title" className="text-xs font-bold text-slate-100">{t('stage.createClockTitle')}</h4>
            <div>
              <label htmlFor="clock-name" className="text-xs text-slate-400 block mb-1">{t('stage.clockName')}</label>
              <input
                id="clock-name"
                data-autofocus
                type="text"
                value={newClockName}
                onChange={(e) => setNewClockName(e.target.value)}
                placeholder={t('stage.clockNamePlaceholder')}
                className="w-full px-3 py-1.5 bg-app border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-hidden focus:border-accent-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="clock-segments" className="text-xs text-slate-400 block mb-1">{t('stage.segments')}</label>
                <select
                  id="clock-segments"
                  value={newClockMax}
                  onChange={(e) => setNewClockMax(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-app border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden"
                >
                  {[4, 6, 8, 12].map((count) => (
                    <option key={count} value={count}>
                      {t('stage.segmentCount', { count })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="clock-type" className="text-xs text-slate-400 block mb-1">{t('stage.clockType')}</label>
                <select
                  id="clock-type"
                  value={newClockType}
                  onChange={(e) => setNewClockType(e.target.value as typeof newClockType)}
                  className="w-full px-2 py-1.5 bg-app border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden"
                >
                  <option value="danger">{t('stage.clockDanger')}</option>
                  <option value="progress">{t('stage.clockProgress')}</option>
                  <option value="mystery">{t('stage.clockMystery')}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClockModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold"
              >
                {t('stage.createClock')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* Scene Lobby Modal */}
      {showNarratorVoice && (
        <CharacterVoiceModal
          onClose={() => setShowNarratorVoice(false)}
          target={{ id: STAGE_NARRATOR_VOICE_ID, name: t('stage.narratorVoice') }}
        />
      )}
      <SceneLobbyModal
        isOpen={showLobbyModal}
        onClose={closeLobby}
        initialRules={lobbyRules}
      />
    </div>
  );
};
