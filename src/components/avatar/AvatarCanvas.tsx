import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { VrmViewer } from './VrmViewer';
import { loadCubismCore } from '../../services/live2dRuntime';
import { Box, Image, Sparkles, Smile, ChevronDown } from 'lucide-react';
import { CharacterProfile } from '../../types';
import { useStoreFields } from '../../store/useAppStore';
import { selectCharacterPortrait } from '../../utils/characterPortraits';
import { translate, useTranslation } from '../../i18n';
import { DropdownMenu } from '../ui/DropdownMenu';
import { AvatarSkeleton, ScrollText } from '../ui';

const Live2DViewer = lazy(() =>
  loadCubismCore()
    .then(() => import('./Live2DViewer'))
    .then((module) => ({ default: module.Live2DViewer }))
);

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

interface MorphingPortraitProps {
  src: string;
  alt: string;
  isSpeaking: boolean;
}

const MorphingPortrait: React.FC<MorphingPortraitProps> = ({ src, alt, isSpeaking }) => {
  const [layers, setLayers] = useState<[string | null, string | null]>([src, null]);
  const [visibleLayer, setVisibleLayer] = useState<0 | 1>(0);
  const visibleLayerRef = useRef<0 | 1>(0);
  const activeSourceRef = useRef(src);
  const loadSequenceRef = useRef(0);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (src === activeSourceRef.current) return;

    const loadSequence = ++loadSequenceRef.current;
    const preloader = new window.Image();

    preloader.onload = () => {
      if (loadSequence !== loadSequenceRef.current) return;

      const nextLayer = (visibleLayerRef.current === 0 ? 1 : 0) as 0 | 1;
      setLayers((current) => {
        const next: [string | null, string | null] = [...current];
        next[nextLayer] = src;
        return next;
      });

      window.requestAnimationFrame(() => {
        if (loadSequence !== loadSequenceRef.current) return;
        visibleLayerRef.current = nextLayer;
        activeSourceRef.current = src;
        setVisibleLayer(nextLayer);

        if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = window.setTimeout(() => {
          setLayers((current) => {
            const next: [string | null, string | null] = [...current];
            next[nextLayer === 0 ? 1 : 0] = null;
            return next;
          });
        }, 550);
      });
    };

    preloader.src = src;

    return () => {
      preloader.onload = null;
    };
  }, [src]);

  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
  }, []);

  return (
    <div className="relative w-full max-w-sm aspect-[4/5] rounded-3xl overflow-hidden border-2 border-accent-500/40 shadow-2xl shadow-accent-500/10 transition-transform duration-700 hover:scale-[1.02]">
      {layers.map((layerSource, index) => layerSource && (
        <img
          key={`${index}-${layerSource}`}
          src={layerSource}
          alt={index === visibleLayer ? alt : ''}
          aria-hidden={index !== visibleLayer}
          className={`absolute inset-0 w-full h-full object-cover transition-[opacity,filter,transform] duration-500 ease-out ${
            index === visibleLayer
              ? 'opacity-100 blur-0 scale-100'
              : 'opacity-0 blur-sm scale-[1.03]'
          } ${isSpeaking && index === visibleLayer ? 'brightness-105 scale-[1.02]' : ''}`}
        />
      ))}

      {isSpeaking && (
        <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-900/80 border border-accent-500/60 text-accent-200 text-xs font-mono animate-pulse backdrop-blur">
          <Sparkles className="w-3.5 h-3.5 text-accent2-400 animate-spin" />
          <span>{translate('avatar.speaking')}</span>
        </div>
      )}
    </div>
  );
};

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
  } = useStoreFields(
    'activeVrmPath', 'activeLive2dPath', 'avatarMode', 'setAvatarMode', 'scannedLive2ds',
    'currentEmotion', 'setCurrentEmotion',
  );
  const { t, tEmotion } = useTranslation();

  // 1. Resolve VRM path (Character override or global setting)
  const vrmPath =
    (character?.card.data.extensions?.custom_vrm as string) ||
    (character?.card.data.extensions?.sow_vrm as string) ||
    activeVrmPath ||
    '';

  // 2. Resolve Live2D model path (Character override or global setting fallback)
  const live2dKey =
    (character?.card.data.extensions?.custom_live2d as string) ||
    (character?.card.data.extensions?.sow_live2d as string) ||
    '';
  const matchedLive2d = live2dKey
    ? scannedLive2ds.find(
        (m) =>
          m.id.toLowerCase() === live2dKey.toLowerCase() ||
          m.model_path.toLowerCase().includes(live2dKey.toLowerCase())
      )
    : scannedLive2ds.find((m) => m.model_path === activeLive2dPath) || scannedLive2ds[0];

  const live2dPath = matchedLive2d?.model_path || activeLive2dPath || '';

  // 3. Resolve granular/canonical emotion portrait, then fall back to neutral/base avatar.
  const emotionImage = selectCharacterPortrait(
    character,
    currentEmotion.emotion,
    currentEmotion.vrm_expression
  );

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
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden border-r border-slate-800 bg-app/80">
      {/* Top Controls: 3-way Mode Selector & Emotion Badge */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {/* Emotion Pill / Tester Dropdown */}
        <DropdownMenu
          triggerLabel={t('avatar.emotionMenu')}
          triggerClassName="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs backdrop-blur shadow-md hover:bg-slate-800 text-accent-300 transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          trigger={
            <>
              <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse motion-reduce:animate-none" />
              <span>{tEmotion(currentEmotion.emotion)}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </>
          }
          heading={t('avatar.emotionMenu')}
          menuClassName="max-h-72 overflow-y-auto"
          items={ALL_GO_EMOTIONS.map((em) => ({
            label: tEmotion(em),
            checked: currentEmotion.emotion === em,
            onSelect: () => handleSelectManualEmotion(em),
          }))}
        />


        {/* 3-way Avatar Mode Selector */}
        <div
          role="group"
          aria-label={t('avatar.modeLabel')}
          className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60 text-xs backdrop-blur shadow-md"
        >
          <button
            onClick={() => setAvatarMode('3d')}
            aria-pressed={avatarMode === '3d'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              avatarMode === '3d'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('avatar.mode3dHint')}
          >
            <Box className="w-3 h-3" />
            <span>{t('avatar.mode3d')}</span>
          </button>

          <button
            onClick={() => setAvatarMode('live2d')}
            aria-pressed={avatarMode === 'live2d'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              avatarMode === 'live2d'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('avatar.modeLive2dHint')}
          >
            <Smile className="w-3 h-3" />
            <span>{t('avatar.modeLive2d')}</span>
          </button>

          <button
            onClick={() => setAvatarMode('2d')}
            aria-pressed={avatarMode === '2d'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              avatarMode === '2d'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('avatar.modeImageHint')}
          >
            <Image className="w-3 h-3" />
            <span>{t('avatar.modeImage')}</span>
          </button>
        </div>
      </div>

      {/* Main Avatar Viewport */}
      {avatarMode === '3d' ? (
        <VrmViewer
          modelPath={vrmPath}
          emotion={currentEmotion.vrm_expression}
          isSpeaking={isSpeaking}
        />
      ) : avatarMode === 'live2d' ? (
        live2dPath ? (
          <Suspense
            fallback={<AvatarSkeleton label={t('avatar.live2dLoading')} />}
          >
            <Live2DViewer
              modelPath={live2dPath}
              emotion={currentEmotion.emotion}
              isSpeaking={isSpeaking}
            />
          </Suspense>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <Smile className="w-12 h-12 text-accent-400/50 mb-2" />
            <p className="text-sm font-semibold text-slate-200">{t('avatar.noLive2dTitle')}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">{t('avatar.noLive2dText')}</p>
          </div>
        )
      ) : (
        /* 2D Portrait / Expression Sprite Mode */
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-linear-to-b from-slate-900/60 via-accent-950/30 to-app">
          {emotionImage ? (
            <MorphingPortrait src={emotionImage} alt={charName} isSpeaking={isSpeaking} />
          ) : (
            <div className="w-48 h-48 rounded-full bg-linear-to-tr from-accent-600 to-accent2-600 flex items-center justify-center text-white text-5xl font-bold border-4 border-accent-500/50 shadow-2xl">
              {charName.charAt(0)}
            </div>
          )}

          <div className="mt-4 text-center">
            <h3 className="text-lg font-bold text-slate-100">{charName}</h3>
            <ScrollText
              label={t('avatar.traits', { name: charName })}
              className="text-xs text-accent-300/80 font-mono mt-0.5 max-w-sm mx-auto"
            >
              {character?.card.data.personality || t('avatar.portraitMode')}
            </ScrollText>
          </div>
        </div>
      )}
    </div>
  );
};
