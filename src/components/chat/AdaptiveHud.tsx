import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Heart, Zap, Smile, Users, ChevronDown, BookOpen, Brain, Sparkles, Camera, Loader2 } from 'lucide-react';
import { CognitiveMemoryDrawer } from './CognitiveMemoryDrawer';

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
    currentEmotion,
    generateImageAction,
    imageGenConfig,
  } = useAppStore();

  const [showSelector, setShowSelector] = useState(false);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | null>(null);

  const handleGenerateSituationalImage = async () => {
    if (!activeCharacter) return;
    setIsGeneratingImage(true);
    try {
      setImageNotice('Generiere Bild...');
      const prompt = await api.buildCharacterImagePrompt(
        activeCharacter.card.data.name,
        activeCharacter.card.data.description,
        currentEmotion?.emotion,
        'masterpiece, anime aesthetic, situational roleplay portrait, expressive eyes',
        undefined
      );
      await generateImageAction(prompt, undefined, imageGenConfig);
      setImageNotice('Bild generiert!');
      setTimeout(() => setImageNotice(null), 3000);
    } catch (e: any) {
      console.error('Failed to generate situational image:', e);
      setImageNotice('Fehler');
      setTimeout(() => setImageNotice(null), 3000);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  if (!activeCharacter) {
    return null;
  }

  const { data } = activeCharacter.card;
  const title = (data.extensions?.sow_title as string) || data.tags?.[0] || 'AI Companion';

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-4 z-40">
      {/* Left: Character Info & Quick Switcher */}
      <div className="flex items-center gap-3 relative">
        <div
          onClick={() => setShowSelector(!showSelector)}
          className="cursor-pointer relative group"
        >
          {activeCharacter.avatar_data_url ? (
            <img
              src={activeCharacter.avatar_data_url}
              alt={data.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-accent-500/60 shadow-md group-hover:border-accent-400 transition-colors"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-accent-600 to-accent2-600 flex items-center justify-center text-white font-bold border-2 border-accent-500/60 shadow-md">
              {data.name.charAt(0)}
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
        </div>

        <div>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="flex items-center gap-1.5 font-bold text-sm text-slate-100 hover:text-accent-300 transition-colors group"
          >
            <span>{data.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-accent-300 transition-transform" />
          </button>
          <div className="text-xs text-slate-400 line-clamp-1">{title}</div>
        </div>

        {/* Character Switcher Popover */}
        {showSelector && (
          <div className="absolute top-12 left-0 w-72 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl p-2 z-50 backdrop-blur space-y-1">
            <div className="text-xs font-semibold text-slate-400 px-2 py-1 flex items-center gap-1 border-b border-slate-800">
              <Users className="w-3.5 h-3.5" />
              <span>Verfügbare Charaktere</span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {availableCharacters.map((char) => (
                <div
                  key={char.id}
                  onClick={() => {
                    selectCharacter(char);
                    setShowSelector(false);
                  }}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCharacter.id === char.id
                      ? 'bg-accent-600/30 text-accent-200 border border-accent-500/40'
                      : 'hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  {char.avatar_data_url ? (
                    <img
                      src={char.avatar_data_url}
                      alt={char.card.data.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent-700 flex items-center justify-center text-xs font-bold">
                      {char.card.data.name.charAt(0)}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold truncate">{char.card.data.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {char.card.data.personality || 'Keine Beschreibung'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-1.5 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowSelector(false);
                  setActiveTab('characters');
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-accent-600/20 hover:bg-accent-600/30 text-accent-300 border border-accent-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Alle Charaktere in Bibliothek anzeigen...</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Middle/Right: Adaptive State Variables HUD */}
      <div className="flex items-center gap-3 text-xs font-mono">
        {/* Persona Badge */}
        <div
          onClick={() => setActiveTab('characters')}
          className="cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs hover:border-indigo-400 transition-colors"
          title="User-Persona (klicken zum Wechseln in der Bibliothek)"
        >
          <span className="text-slate-400">Du:</span>
          <span className="font-semibold text-indigo-200">{activePersona.name}</span>
        </div>

        {/* Lorebook Badge */}
        {activeLorebooks.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-slate-300 text-xs">
            <BookOpen className="w-3 h-3 text-amber-400" />
            <span>Lorebook Aktiv</span>
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
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition cursor-pointer ${
            serverConfig.reasoning_mode
              ? 'bg-amber-950/50 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
          }`}
          title={
            serverConfig.reasoning_mode
              ? 'Reasoning-Modus ist AN (Modell denkt intern in <think>-Tags nach)'
              : 'Reasoning-Modus ist AUS (Sofortiges Rollenspiel ohne Denkpause)'
          }
        >
          <Sparkles className={`w-3.5 h-3.5 ${serverConfig.reasoning_mode ? 'text-amber-400' : 'text-slate-500'}`} />
          <span className="hidden sm:inline">Reasoning:</span>
          <span className={serverConfig.reasoning_mode ? 'text-amber-300 font-bold' : 'text-slate-400'}>
            {serverConfig.reasoning_mode ? 'An' : 'Aus'}
          </span>
        </button>

        {/* Cognitive Soul Memory Drawer Trigger */}
        <button
          onClick={() => setShowMemoryDrawer(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-950/50 border border-accent-500/40 text-accent-300 hover:bg-accent-900/60 hover:text-accent-200 transition text-xs font-medium shadow-sm cursor-pointer"
          title="Kognitiven Seelenspeicher öffnen"
        >
          <Brain className="w-3.5 h-3.5 text-accent-400" />
          <span>Seelenspeicher</span>
        </button>

        {/* Quick Situational Image Generator */}
        <button
          onClick={handleGenerateSituationalImage}
          disabled={isGeneratingImage}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/50 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 hover:text-indigo-200 transition text-xs font-medium shadow-sm cursor-pointer disabled:opacity-50"
          title="Situationsbild des aktuellen Charakters generieren"
        >
          {isGeneratingImage ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden lg:inline">{imageNotice || 'Foto'}</span>
        </button>
      </div>

      <CognitiveMemoryDrawer
        isOpen={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
      />
    </div>
  );
};

