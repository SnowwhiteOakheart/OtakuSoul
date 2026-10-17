import { lazy, Suspense, useState } from 'react';
import { VrmViewer } from '../avatar/VrmViewer';
import { loadCubismCore } from '../../services/live2dRuntime';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { AvatarSkeleton } from '../ui';

const MmdViewer = lazy(() => import('../avatar/MmdViewer'));
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));
const Live2DViewer = lazy(() =>
  loadCubismCore()
    .then(() => import('../avatar/Live2DViewer'))
    .then((module) => ({ default: module.Live2DViewer })),
);

/** Feelings to try on a Live2D model (3D viewers bring their own menu). */
const LIVE2D_EMOTIONS = ['neutral', 'joy', 'anger', 'sadness', 'surprise', 'relief'] as const;

interface AvatarPreviewProps {
  kind: 'vrm' | 'live2d';
  /** Model file (3D) or model JSON (Live2D). */
  path: string;
}

/** A live, movable preview of one model, with the same viewer as the chat. */
export function AvatarPreview({ kind, path }: AvatarPreviewProps) {
  const { t, tEmotion } = useTranslation();
  const { avatarMotions } = useStoreFields('avatarMotions');
  const [expression, setExpression] = useState('neutral');
  const [emotion, setEmotion] = useState<string>('neutral');

  if (kind === 'live2d') {
    return (
      <div className="flex h-full flex-col" data-avatar-preview="live2d">
        <div className="min-h-0 flex-1">
          <Suspense fallback={<AvatarSkeleton label={t('avatar.live2dLoading')} />}>
            <Live2DViewer key={path} modelPath={path} emotion={emotion} />
          </Suspense>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 border-t border-slate-800 p-2" role="group" aria-label={t('avatars.tryEmotion')}>
          {LIVE2D_EMOTIONS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setEmotion(name)}
              aria-pressed={emotion === name}
              className={`rounded-full border px-2.5 py-1 text-xs ${emotion === name ? 'border-accent-400 bg-accent-600 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            >
              {tEmotion(name)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const props = { modelPath: path, emotion: expression, motions: avatarMotions, onPickEmotion: setExpression };
  return (
    <div className="h-full" data-avatar-preview="vrm">
      {/\.(pmx|pmd)$/i.test(path) ? (
        <Suspense fallback={<AvatarSkeleton label={t('avatar.vrmLoading')} />}>
          <MmdViewer key={path} {...props} />
        </Suspense>
      ) : /\.(glb|gltf)$/i.test(path) ? (
        <Suspense fallback={<AvatarSkeleton label={t('avatar.vrmLoading')} />}>
          <GltfViewer key={path} {...props} />
        </Suspense>
      ) : (
        <VrmViewer key={path} {...props} />
      )}
    </div>
  );
}
