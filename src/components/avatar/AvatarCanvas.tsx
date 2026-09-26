import React, { useState } from 'react';
import { VrmViewer } from './VrmViewer';
import { Live2DViewer } from './Live2DViewer';
import { Box, Image, Sparkles, Smile, ChevronDown, Check } from 'lucide-react';
import { CharacterProfile } from '../../types';
import { useAppStore } from '../../store/useAppStore';

const ALL_GO_EMOTIONS = [
  'admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring',
  'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval',
  'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief',
  'joy', 'love', 'nervousness', 'optimism', 'pride', 'realization',
  'relief', 'remorse', 'sadness', 'surprise', 'neutral',
];

interface AvatarCanvasProps {
  character: CharacterProfile | null;
  isSpeaking?: boolean;
}

export const AvatarCanvas: React.FC<AvatarCanvasProps> = ({
  character,
  isSpeaking = false,
}) => {
  const {
    activeVrmPath,
    activeLive2dPath,
    avatarMode,
    setAvatarMode,
    scannedLive2ds,
    currentEmotion,
    setCurrentEmotion,
  } = useAppStore();

  const [showEmotionMenu, setShowEmotionMenu] = useState(false);

  // 1. Resolve VRM path (Character override or global setting)
  const vrmPath =
    (character?.card.data.extensions?.sow_vrm as string) ||
    activeVrmPath ||
    '';

  // 2. Resolve Live2D model path (Character override or global setting fallback)
  const live2dKey = (character?.card.data.extensions?.sow_live2d as string) || '';
  const matchedLive2d = live2dKey
    ? scannedLive2ds.find(
        (m) =>
          m.id.toLowerCase() === live2dKey.toLowerCase() ||
          m.model_path.toLowerCase().includes(live2dKey.toLowerCase())
      )
    : scannedLive2ds.find((m) => m.model_path === activeLive2dPath) || scannedLive2ds[0];

  const live2dPath = matchedLive2d?.model_path || activeLive2dPath || '';

  // 3. Resolve 2D Avatar URL or Emotion Expression Image / GIF
  const expressionsMap =
    (character?.card.data.extensions?.expressions as Record<string, string>) ||
    (character?.card.data.extensions?.sow_expressions as Record<string, string>) ||
    {};

  const emotionImage =
    expressionsMap[currentEmotion.emotion] ||
    expressionsMap[currentEmotion.vrm_expression] ||
    character?.avatar_data_url;

  const charName = character?.card.data.name || 'OtakuSoul Companion';

  const handleSelectManualEmotion = (em: string) => {
    const vrm = ['joy', 'amusement', 'excitement', 'love', 'optimism', 'pride', 'gratitude', 'admiration'].includes(em)
      ? 'happy'
      : ['anger', 'annoyance', 'disapproval', 'disgust'].includes(em)
      ? 'angry'
      : ['sadness', 'grief', 'disappointment', 'remorse'].includes(em)
      ? 'sad'
      : ['surprise', 'confusion', 'curiosity'].includes(em)
      ? 'surprised'
      : 'relaxed';

    setCurrentEmotion({
      emotion: em,
      vrm_expression: vrm,
      live2d_expression: `${em}_animation`,
      confidence: 1.0,
      intensity: 0.8,
    });
    setShowEmotionMenu(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden border-r border-slate-800 bg-slate-950/80">
      {/* Top Controls: 3-way Mode Selector & Emotion Badge */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {/* Emotion Pill / Tester Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowEmotionMenu(!showEmotionMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs backdrop-blur shadow-md hover:bg-slate-800 text-purple-300 font-mono transition-all"
            title="Emotionen ansehen / manuell testen"
          >
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="capitalize">{currentEmotion.emotion}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showEmotionMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 max-h-60 overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-xl p-1 shadow-2xl backdrop-blur-xl z-50 text-xs">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                28 GoEmotions testen
              </div>
              {ALL_GO_EMOTIONS.map((em) => (
                <button
                  key={em}
                  onClick={() => handleSelectManualEmotion(em)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    currentEmotion.emotion === em
                      ? 'bg-purple-600/30 text-purple-200 font-medium'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="capitalize">{em}</span>
                  {currentEmotion.emotion === em && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3-way Avatar Mode Selector */}
        <div className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60 text-xs backdrop-blur shadow-md">
          <button
            onClick={() => setAvatarMode('3d')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              avatarMode === '3d'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="3D VRM-Avatar aktivieren"
          >
            <Box className="w-3 h-3" />
            <span>3D VRM</span>
          </button>

          <button
            onClick={() => setAvatarMode('live2d')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              avatarMode === 'live2d'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="2D Live2D-Avatar aktivieren"
          >
            <Smile className="w-3 h-3" />
            <span>Live2D</span>
          </button>

          <button
            onClick={() => setAvatarMode('2d')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              avatarMode === '2d'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="2D Porträt-Bild aktivieren"
          >
            <Image className="w-3 h-3" />
            <span>2D Bild</span>
          </button>
        </div>
      </div>

      {/* Main Avatar Viewport */}
      {avatarMode === '3d' ? (
        <VrmViewer
          modelPath={vrmPath}
          emotion={currentEmotion.vrm_expression as any}
          isSpeaking={isSpeaking}
        />
      ) : avatarMode === 'live2d' ? (
        live2dPath ? (
          <Live2DViewer
            modelPath={live2dPath}
            emotion={currentEmotion.emotion}
            isSpeaking={isSpeaking}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <Smile className="w-12 h-12 text-purple-400/50 mb-2" />
            <p className="text-sm font-semibold text-slate-200">Kein Live2D-Modell gefunden</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Wähle in der Charakter-Bibliothek ein Live2D-Modell für diesen Charakter aus.
            </p>
          </div>
        )
      ) : (
        /* 2D Portrait / Expression Sprite Mode */
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900/60 via-purple-950/30 to-slate-950">
          {emotionImage ? (
            <div className="relative group max-w-sm rounded-3xl overflow-hidden border-2 border-purple-500/40 shadow-2xl shadow-purple-500/10 transition-all duration-700 hover:scale-[1.02]">
              <img
                src={emotionImage}
                alt={charName}
                className={`w-full max-h-[70vh] object-cover transition-all duration-500 ${
                  isSpeaking ? 'scale-[1.02] filter brightness-105' : ''
                }`}
              />
              {/* Speaking audio wave indicator */}
              {isSpeaking && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-900/80 border border-purple-500/60 text-purple-200 text-xs font-mono animate-pulse backdrop-blur">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
                  <span>Spricht...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white text-5xl font-bold border-4 border-purple-500/50 shadow-2xl">
              {charName.charAt(0)}
            </div>
          )}

          <div className="mt-4 text-center">
            <h3 className="text-lg font-bold text-slate-100">{charName}</h3>
            <p className="text-xs text-purple-300/80 font-mono mt-0.5">
              {character?.card.data.personality || '2D Anime Avatar Mode'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
