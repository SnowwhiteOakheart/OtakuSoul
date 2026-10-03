import { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { Heart, Zap, Smile, Users, ChevronDown, BookOpen, Brain, Sparkles, Camera, Loader2 } from 'lucide-react';
import { CognitiveMemoryDrawer } from './CognitiveMemoryDrawer';
import { translate, useTranslation } from '../../i18n';
import { toast } from '../ui/feedback';
import { DropdownMenu } from '../ui/DropdownMenu';
import { errorMessage } from '../../utils/errors';
import { localizeCard } from '../../utils/cardI18n';

export const AdaptiveHud = () => {
  const {
    activeCharacter,
    availableCharacters,
    selectCharacter,
    stateVariables,
    activeLorebooks,
    serverConfig,
    setServerConfig,
    setActiveTab,
    activePersona,
    generateSceneImage,
    isGeneratingSceneImage: isGeneratingImage,
  } = useStoreFields(
    'activeCharacter', 'availableCharacters', 'selectCharacter', 'stateVariables',
    'activeLorebooks', 'serverConfig', 'setServerConfig', 'setActiveTab', 'activePersona',
    'generateSceneImage', 'isGeneratingSceneImage',
  );

  const { t, currentLanguage } = useTranslation();
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);

  const handleGenerateSituationalImage = async () => {
    try {
      const res = await generateSceneImage('chat');
      if (res) toast.success(translate('hud.imageDone'));
    } catch (e) {
      console.error('Failed to generate situational image:', e);
      toast.error(translate('hud.imageFailed', { error: errorMessage(e) }));
    }
  };

  if (!activeCharacter) {
    return null;
  }

  const data = localizeCard(activeCharacter.card.data, currentLanguage);
  const title = (data.extensions?.sow_title as string) || data.tags?.[0] || t('library.defaultTitle');

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-4 z-40">
      {/* Left: Character Info & Quick Switcher */}
      <div className="flex items-center gap-3 relative">
        <div className="relative shrink-0" aria-hidden>
          {activeCharacter.avatar_data_url ? (
            <img
              src={activeCharacter.avatar_data_url}
              alt={data.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-accent-500/60 shadow-md"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-accent-600 to-accent2-600 flex items-center justify-center text-white font-bold border-2 border-accent-500/60 shadow-md">
              {data.name.charAt(0)}
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
        </div>

        <div className="min-w-0">
          <DropdownMenu
            align="left"
            triggerLabel={t('hud.switchCharacter')}
            triggerClassName="flex items-center gap-1.5 font-bold text-sm text-slate-100 hover:text-accent-300 transition-colors rounded outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            trigger={
              <>
                <span className="truncate max-w-48">{data.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </>
            }
            heading={t('hud.availableCharacters')}
            menuClassName="w-72 max-h-80 overflow-y-auto"
            items={[
              ...availableCharacters.map((char) => ({
                label: char.card.data.name,
                description: localizeCard(char.card.data, currentLanguage).personality || t('hud.noDescription'),
                checked: activeCharacter.id === char.id,
                leading: char.avatar_data_url ? (
                  <img src={char.avatar_data_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-accent-700 grid place-items-center text-xs font-bold shrink-0">
                    {char.card.data.name.charAt(0)}
                  </span>
                ),
                onSelect: () => selectCharacter(char),
              })),
              { label: t('hud.openLibrary'), icon: Users, onSelect: () => setActiveTab('characters') },
            ]}
          />
          <div className="text-xs text-slate-400 line-clamp-1">{title}</div>
        </div>
      </div>

      {/* Middle/Right: Adaptive State Variables HUD */}
      <div className="flex items-center gap-3 text-xs font-mono">
        {/* Persona Badge */}
        <button
          type="button"
          onClick={() => setActiveTab('characters')}
          className="cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs hover:border-indigo-400 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('hud.personaHint')}
        >
          <span className="text-slate-400">{t('hud.you')}</span>
          <span className="font-semibold text-indigo-200">{activePersona.name}</span>
        </button>

        {/* Lorebook Badge */}
        {activeLorebooks.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-slate-300 text-xs">
            <BookOpen className="w-3 h-3 text-amber-400" />
            <span className="whitespace-nowrap">{t('hud.lorebookActive')}</span>
          </div>
        )}

        {/* State Variables */}
        {stateVariables.map((v, i) => {
          if (v.var_type === 'progress') {
            const val = parseInt(v.value) || 0;
            const max = v.max_value || 100;
            const percent = Math.min(100, Math.round((val / max) * 100));

            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60"
              >
                {v.name === 'Zuneigung' ? (
                  <Heart className="w-3.5 h-3.5 text-accent2-400 fill-accent2-400/40" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span className="text-slate-300 text-xs font-sans">{v.name}:</span>
                <div className="w-16 bg-app rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      v.name === 'Zuneigung'
                        ? 'bg-linear-to-r from-accent2-500 to-rose-400'
                        : 'bg-linear-to-r from-cyan-500 to-indigo-400'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-200">
                  {val}/{max}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs"
            >
              <Smile className="w-3.5 h-3.5 text-accent-400" />
              <span className="text-slate-400 font-sans">{v.name}:</span>
              <span className="text-accent-200 font-medium">{v.value}</span>
            </div>
          );
        })}

        {/* Quick Reasoning Mode Toggle */}
        <button
          onClick={() => setServerConfig({ reasoning_mode: !serverConfig.reasoning_mode })}
          aria-pressed={serverConfig.reasoning_mode}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            serverConfig.reasoning_mode
              ? 'bg-amber-950/50 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
          }`}
          title={serverConfig.reasoning_mode ? t('hud.reasoningOnHint') : t('hud.reasoningOffHint')}
        >
          <Sparkles className={`w-3.5 h-3.5 ${serverConfig.reasoning_mode ? 'text-amber-400' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">{t('hud.reasoning')}</span>
          <span className={serverConfig.reasoning_mode ? 'text-amber-300 font-bold' : 'text-slate-400'}>
            {serverConfig.reasoning_mode ? t('hud.on') : t('hud.off')}
          </span>
        </button>

        {/* Cognitive Soul Memory Drawer Trigger */}
        <button
          onClick={() => setShowMemoryDrawer(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-950/50 border border-accent-500/40 text-accent-300 hover:bg-accent-900/60 hover:text-accent-200 transition text-xs font-medium shadow-sm cursor-pointer whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('hud.memoryHint')}
          aria-label={t('hud.memoryHint')}
        >
          <Brain className="w-3.5 h-3.5 text-accent-400" />
          <span className="hidden md:inline">{t('hud.memory')}</span>
        </button>

        {/* Quick Situational Image Generator */}
        <button
          onClick={handleGenerateSituationalImage}
          disabled={isGeneratingImage}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/50 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 hover:text-indigo-200 transition text-xs font-medium shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={isGeneratingImage ? t('hud.generatingImage') : t('hud.photoHint')}
          aria-label={t('hud.photoHint')}
        >
          {isGeneratingImage ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden lg:inline">{t('hud.photo')}</span>
        </button>
      </div>

      <CognitiveMemoryDrawer
        isOpen={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
      />
    </div>
  );
};

