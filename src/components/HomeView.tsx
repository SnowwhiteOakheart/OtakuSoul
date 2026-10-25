import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, Cloud, Compass, Cpu, Dice5, MessageSquare, Settings2, Sparkles, TriangleAlert, UserPlus } from 'lucide-react';
import { useStoreFields } from '../store/useAppStore';
import { useTranslation } from '../i18n';
import { continueScenes } from './stage/StoryGallery';
import { useChatLora } from './settings/sections/ChatLoraPicker';

/** Model name of a GGUF path: the file name without folder and extension. */
const modelName = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.gguf$/i, '') ?? '';

/**
 * Start page: which AI answers, continue the last chat or story, discover characters. For
 * beginners it is the first thing after the wizard; returning users can go straight to the chat.
 */
export const HomeView: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeCharacter, activePersona, setActiveTab, openSettingsSection, reopenOnboarding, startTab, setStartTab,
    selectedBackend, cloudModel, cloudApiKey, cloudProvider, serverConfig, serverStatus, stageScenes, fetchStageScenes,
    stageLastScene,
  } = useStoreFields(
    'activeCharacter', 'activePersona', 'setActiveTab', 'openSettingsSection', 'reopenOnboarding', 'startTab', 'setStartTab',
    'selectedBackend', 'cloudModel', 'cloudApiKey', 'cloudProvider', 'serverConfig', 'serverStatus', 'stageScenes', 'fetchStageScenes',
    'stageLastScene',
  );

  useEffect(() => {
    void fetchStageScenes();
  }, [fetchStageScenes]);

  const isCloud = selectedBackend === 'cloud';
  const { chosen: adapter } = useChatLora();
  // The adapter in use belongs to the model's name (e.g. "gemma-4-E4B-it-Q4_K_M + Heretic").
  const localModel = [modelName(serverConfig.model_path), adapter?.name].filter(Boolean).join(' + ');
  const configured = isCloud ? !!cloudModel && (!!cloudApiKey || cloudProvider === 'custom') : !!localModel;
  const lastStory = stageScenes.find((scene) => scene.id === stageLastScene) ?? continueScenes(stageScenes, 1)[0];
  const name = activePersona.name && activePersona.name !== 'User' ? activePersona.name : '';
  const character = activeCharacter?.card.data.name;

  const card =
    'group flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left transition hover:border-accent-500/50 hover:bg-slate-900';

  return (
    <div className="flex-1 overflow-y-auto" data-home>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">{name ? t('home.greetingName', { name }) : t('home.greeting')}</h1>
          <p className="text-sm text-slate-400">{t('home.question')}</p>
        </header>

        {configured ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm" data-home-ai="ready">
            {isCloud ? <Cloud className="w-4 h-4 text-sky-300" /> : <Cpu className="w-4 h-4 text-emerald-300" />}
            <span className="text-slate-300">
              {isCloud ? t('home.aiCloud', { model: cloudModel }) : t('home.aiLocal', { model: localModel })}
              {!isCloud && serverStatus.state !== 'running' && <span className="text-slate-500"> · {t('home.aiStartsOnDemand')}</span>}
            </span>
            <button
              type="button"
              onClick={() => openSettingsSection(isCloud ? 'providers' : 'server')}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {t('home.changeAi')}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3" data-home-ai="missing">
            <TriangleAlert className="w-5 h-5 text-amber-300" />
            <div className="flex-1 min-w-48">
              <p className="text-sm font-semibold text-amber-100">{t('home.aiMissing')}</p>
              <p className="text-xs text-amber-200/80">{t('home.aiMissingHint')}</p>
            </div>
            <button
              type="button"
              onClick={reopenOnboarding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              {t('home.setUpAi')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <button type="button" onClick={() => setActiveTab(character ? 'chat' : 'characters')} className={card} data-home-card="chat">
            <div className="space-y-2">
              <span className="flex items-center gap-3">
                {activeCharacter?.avatar_data_url ? (
                  <img src={activeCharacter.avatar_data_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-600/20 text-accent-300">
                    <MessageSquare className="w-6 h-6" />
                  </span>
                )}
                <span className="text-lg font-semibold text-slate-100">{character ? t('home.chatWith', { name: character }) : t('home.chatTitle')}</span>
              </span>
              <p className="text-sm text-slate-400">{character ? t('home.chatContinueHint') : t('home.chatHint')}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-300 group-hover:text-accent-200">
              {character ? t('home.chatContinue') : t('home.chooseCharacter')}
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>

          <button type="button" onClick={() => setActiveTab('stage')} className={card} data-home-card="stage">
            <div className="space-y-2">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600/20 text-rose-300">
                  <Dice5 className="w-6 h-6" />
                </span>
                <span className="text-lg font-semibold text-slate-100">{lastStory ? t('home.storyContinueTitle') : t('home.storyTitle')}</span>
              </span>
              <p className="text-sm text-slate-400">{lastStory ? lastStory.title : t('home.storyHint')}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-300 group-hover:text-rose-200">
              {lastStory ? t('home.storyContinue') : t('home.storyChoose')}
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>

          <button type="button" onClick={() => setActiveTab('hub')} className={card} data-home-card="hub">
            <div className="space-y-2">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-300">
                  <Compass className="w-6 h-6" />
                </span>
                <span className="text-lg font-semibold text-slate-100">{t('home.discoverTitle')}</span>
              </span>
              <p className="text-sm text-slate-400">{t('home.discoverHint')}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 group-hover:text-emerald-200">
              {t('home.discover')}
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('characters')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            <UserPlus className="w-4 h-4" />
            {t('home.createCharacter')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lorebooks')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            <BookOpen className="w-4 h-4" />
            {t('home.lorebooks')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('companion')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            <Sparkles className="w-4 h-4" />
            {t('home.companion')}
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={startTab === 'chat'} onChange={(e) => setStartTab(e.target.checked ? 'chat' : 'home')} className="accent-accent-500" />
          {t('home.startInChat')}
        </label>
      </div>
    </div>
  );
};
