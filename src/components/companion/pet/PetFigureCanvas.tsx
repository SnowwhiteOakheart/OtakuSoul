import { Suspense } from 'react';
import type React from 'react';
import { VrmViewer } from '../../avatar/VrmViewer';
import type { PetFigure } from '../../avatar/avatarStage';
import { PET_FEET_SHARE } from '../../../services/avatarViewState';
import { isLive2dPath, isPortraitPath, type PetState } from '../../../services/desktopPet';
import type { GestureRequest, LoopRole } from '../../../utils/avatarGestures';
import type { PetMode, PetSeat } from '../petBehavior';
import {
  EXPRESSION_EMOTIONS,
  GltfViewer,
  Inochi2dViewer,
  Live2DViewer,
  MmdViewer,
  PortraitPet,
  SIT_DROP,
  isGltfModel,
  isInochi2dModel,
  isMmdModel,
} from './petConstants';

interface PetLink {
  onStage: (stage: PetFigure | null) => void;
  onLoops: (available: Record<LoopRole, boolean>) => void;
  onFloorSit: (available: boolean) => void;
}

interface PetFigureCanvasProps {
  pet: PetState | null;
  modelPath: string;
  mode: PetMode;
  loop: LoopRole | null;
  seat: PetSeat | null;
  hop: boolean;
  walking: boolean;
  lift: number;
  isSpeaking: boolean;
  faceOverride: string | null;
  sentenceFace: string | null;
  gesture: GestureRequest | null;
  petLink: PetLink;
  figureRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  noModelLabel: string;
}

export const PetFigureCanvas: React.FC<PetFigureCanvasProps> = ({
  pet,
  modelPath,
  mode,
  loop,
  seat,
  hop,
  walking,
  lift,
  isSpeaking,
  faceOverride,
  sentenceFace,
  gesture,
  petLink,
  figureRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  noModelLabel,
}) => {
  const viewerProps = {
    modelPath,
    // Only VRM models have a blush; glTF and MMD show their relaxed face instead.
    emotion:
      (faceOverride === 'blush' && /\.(pmx|pmd|glb|gltf)$/i.test(modelPath) ? 'relaxed' : faceOverride) ??
      sentenceFace ??
      pet?.expression ??
      'neutral',
    isSpeaking,
    motions: pet?.motions ?? [],
    gesture,
    pet: petLink,
    loop,
    seat,
  };

  return (
    <>
      {pet && modelPath && (
        <div
          aria-hidden
          data-pet-shadow
          // A lifted model stands higher; sitting rests on the window's edge regardless.
          style={lift && loop !== 'sit' ? { bottom: `${(PET_FEET_SHARE + lift) * 100}%` } : undefined}
          className={`pet-shadow ${loop === 'sit' ? 'pet-shadow-sit' : ''} ${
            mode === 'dragged' || mode === 'falling' ? 'pet-shadow-off' : hop ? 'pet-shadow-hop' : ''
          }`}
        />
      )}
      <div
        ref={figureRef}
        className={`absolute inset-0 ${hop ? 'pet-hop' : walking ? 'pet-walk' : ''}`}
        style={loop === 'sit' ? { transform: `translateY(${SIT_DROP * 100}%)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {pet && modelPath ? (
          <Suspense fallback={null}>
            {isPortraitPath(modelPath) ? (
              <PortraitPet
                key={modelPath}
                src={pet.portrait ?? ''}
                characterId={pet.characterId}
                isSpeaking={isSpeaking}
                pet={petLink}
                loop={loop}
              />
            ) : isLive2dPath(modelPath) ? (
              <Live2DViewer
                key={modelPath}
                modelPath={modelPath}
                emotion={
                  (faceOverride ?? sentenceFace ? EXPRESSION_EMOTIONS[(faceOverride ?? sentenceFace)!] : undefined) ??
                  pet.emotion ??
                  'neutral'
                }
                isSpeaking={isSpeaking}
                pet={petLink}
              />
            ) : isInochi2dModel(modelPath) ? (
              <Inochi2dViewer
                key={modelPath}
                modelPath={modelPath}
                emotion={
                  (faceOverride ?? sentenceFace ? EXPRESSION_EMOTIONS[(faceOverride ?? sentenceFace)!] : undefined) ??
                  pet.emotion ??
                  'neutral'
                }
                isSpeaking={isSpeaking}
                gesture={gesture}
                pet={petLink}
                loop={loop}
              />
            ) : isMmdModel(modelPath) ? (
              <MmdViewer key={modelPath} {...viewerProps} />
            ) : isGltfModel(modelPath) ? (
              <GltfViewer key={modelPath} {...viewerProps} />
            ) : (
              <VrmViewer key={modelPath} {...viewerProps} />
            )}
          </Suspense>
        ) : pet ? (
          <div
            data-pet-solid
            className="absolute inset-x-3 bottom-3 rounded-2xl bg-app/85 border border-slate-700 p-3 text-center text-xs text-slate-300"
          >
            <p className="font-semibold text-slate-100">{pet.characterName}</p>
            <p className="mt-1">{noModelLabel}</p>
          </div>
        ) : null}
      </div>
    </>
  );
};
