import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { VrmViewer } from '../avatar/VrmViewer';
import type { PetFigure } from '../avatar/avatarStage';
import { PET_FEET_SHARE, type PetFraming } from '../../services/avatarViewState';
import { PET_PRESETS, petWindowSize } from '../../services/desktopPet';

const MmdViewer = lazy(() => import('../avatar/MmdViewer'));
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));
const Inochi2dViewer = lazy(() => import('../avatar/Inochi2dViewer'));

/**
 * A model as the desktop pet shows it (whole figure, its framing, the shadow at its feet), in
 * the pet window's proportions at the small size. Changes of `framing` apply without reloading.
 */
export function PetFramePreview({ modelPath, framing }: { modelPath: string; framing: PetFraming }) {
  const stageRef = useRef<PetFigure | null>(null);
  const framingRef = useRef(framing);
  useEffect(() => {
    framingRef.current = framing;
    stageRef.current?.setFraming(framing);
  }, [framing]);
  const pet = useMemo(
    () => ({
      onStage: (stage: PetFigure | null) => {
        stageRef.current = stage;
        stage?.setFraming(framingRef.current);
      },
    }),
    [],
  );

  const viewer = /\.(inp|inx)$/i.test(modelPath) ? (
    <Inochi2dViewer key={modelPath} modelPath={modelPath} pet={pet} />
  ) : /\.(pmx|pmd)$/i.test(modelPath) ? (
    <MmdViewer key={modelPath} modelPath={modelPath} pet={pet} />
  ) : /\.(glb|gltf)$/i.test(modelPath) ? (
    <GltfViewer key={modelPath} modelPath={modelPath} pet={pet} />
  ) : (
    <VrmViewer key={modelPath} modelPath={modelPath} pet={pet} />
  );

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-slate-800 bg-app"
      style={petWindowSize(PET_PRESETS.small)}
      data-pet-preview
    >
      <div aria-hidden className="pet-shadow" style={{ bottom: `${(PET_FEET_SHARE + framing.lift) * 100}%` }} />
      <div className="absolute inset-0">
        <Suspense fallback={null}>{viewer}</Suspense>
      </div>
    </div>
  );
}
