import { lazy, Suspense, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { takeSnapshot } from '../../services/avatarSnapshot';
import { VrmViewer } from '../avatar/VrmViewer';
import { loadCubismCore } from '../../services/live2dRuntime';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { AvatarSkeleton } from '../ui';
import type { AvatarKind } from '../../types';

const MmdViewer = lazy(() => import('../avatar/MmdViewer'));
const Inochi2dViewer = lazy(() => import('../avatar/Inochi2dViewer'));
const GltfViewer = lazy(() => import('../avatar/GltfViewer'));
const Live2DViewer = lazy(() =>
  loadCubismCore()
    .then(() => import('../avatar/Live2DViewer'))
    .then((module) => ({ default: module.Live2DViewer })),
);

/** Feelings to try on a Live2D model or Inochi2D puppet (3D viewers bring their own menu). */
const LIVE2D_EMOTIONS = ['neutral', 'joy', 'anger', 'sadness', 'surprise', 'relief'] as const;

interface AvatarPreviewProps {
  kind: AvatarKind;
  /** Model file (3D, Inochi2D) or model JSON (Live2D). */
  path: string;
  /** Set to a function that takes a picture of the current view (null while there is none). */
  captureRef?: MutableRefObject<(() => string | null) | null>;
  /** Takes a picture by itself once the model shows (for models without a preview picture). */
  onAutoSnapshot?: (picture: string) => void;
}

/** Tries for a picture this often, `AUTO_SNAPSHOT_MS` apart (large models load for a while). */
const AUTO_SNAPSHOT_TRIES = 12;
const AUTO_SNAPSHOT_MS = 1500;

/** A live, movable preview of one model, with the same viewer as the chat. */
export function AvatarPreview({ kind, path, captureRef, onAutoSnapshot }: AvatarPreviewProps) {
  const { t, tEmotion } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const autoSnapshot = useRef(onAutoSnapshot);
  useEffect(() => {
    autoSnapshot.current = onAutoSnapshot;
  });
  const wantsAuto = !!onAutoSnapshot;

  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => (containerRef.current ? takeSnapshot(containerRef.current) : null);
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  // The first drawn frame may still be mid-load: the picture is taken on the second success in a row.
  useEffect(() => {
    if (!wantsAuto) return;
    let tries = 0;
    let seen = false;
    const timer = window.setInterval(() => {
      tries += 1;
      const picture = containerRef.current ? takeSnapshot(containerRef.current) : null;
      if (picture && seen) {
        window.clearInterval(timer);
        autoSnapshot.current?.(picture);
        return;
      }
      seen = !!picture;
      if (tries >= AUTO_SNAPSHOT_TRIES) window.clearInterval(timer);
    }, AUTO_SNAPSHOT_MS);
    return () => window.clearInterval(timer);
  }, [path, wantsAuto]);
  const { avatarMotions } = useStoreFields('avatarMotions');
  const [expression, setExpression] = useState('neutral');
  const [emotion, setEmotion] = useState<string>('neutral');

  if (kind === 'live2d' || kind === 'inochi2d') {
    return (
      <div className="flex h-full flex-col" data-avatar-preview={kind}>
        <div ref={containerRef} className="min-h-0 flex-1">
          {kind === 'live2d' ? (
            <Suspense fallback={<AvatarSkeleton label={t('avatar.live2dLoading')} />}>
              <Live2DViewer key={path} modelPath={path} emotion={emotion} />
            </Suspense>
          ) : (
            <Suspense fallback={<AvatarSkeleton label={t('avatar.inochi2dLoading')} />}>
              <Inochi2dViewer key={path} modelPath={path} emotion={emotion} />
            </Suspense>
          )}
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
    <div ref={containerRef} className="h-full" data-avatar-preview="vrm">
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
