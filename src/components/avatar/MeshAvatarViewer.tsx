import React, { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { MeshAvatar } from 'mesh-avatar';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { answerSnapshots } from '../../services/avatarSnapshot';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import type { GestureRequest, MotionRole } from '../../utils/avatarGestures';
import { zoneInViewer, type FigureTouch } from './avatarTouch';

interface MeshAvatarViewerProps {
  /** The `.mavatar` archive. */
  modelPath: string;
  /** VRM expression of the mood (happy, sad, angry, surprised, relaxed, neutral). */
  emotion?: string;
  isSpeaking?: boolean;
  /** Gesture from the chat: played with the runtime's motion for that use, if it has one. */
  gesture?: GestureRequest | null;
  /** The avatar was tapped (not dragged): a pat on the head or a poke, with its place in the viewer. */
  onTouch?: (touch: FigureTouch) => void;
}

/** The runtime's emotion tags are the VRM expressions; anything else is calm. */
const EMOTION_TAGS = new Set(['happy', 'sad', 'angry', 'surprised', 'relaxed']);

/** The runtime's motions for the chat's gesture uses. */
const GESTURE_MOTIONS: Partial<Record<MotionRole, string>> = {
  greeting: 'greet',
  nod: 'nod',
  happy: 'giggle',
  surprised: 'surprise',
  thinking: 'think',
  sad: 'no',
};

/** Motions a tap on the avatar starts (one at random). */
const TAP_MOTIONS = ['shy', 'giggle', 'tilt', 'wink'];

/** A tap moves this little (px) and lasts this long (ms); anything more is a drag. */
const TAP_MOVE = 6;
const TAP_MS = 500;

/**
 * Mesh avatar from Mesh Avatar Studio (`.mavatar`) in the chat and the avatar library: the
 * `mesh-avatar` runtime animates the layered illustration (blinking, breathing, hair, head turns),
 * the voice moves the mouth, the mood picks the expression and the eyes follow the pointer.
 * The archive is read through the app and handed over as bytes (its pictures become blob URLs).
 */
export const MeshAvatarViewer: React.FC<MeshAvatarViewerProps> = ({
  modelPath,
  emotion = 'neutral',
  isSpeaking = false,
  gesture = null,
  onTouch,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatarRef = useRef<MeshAvatar | null>(null);
  const onTouchRef = useRef(onTouch);
  const emotionRef = useRef(emotion);
  const speakingRef = useRef(isSpeaking);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by "reload": the runtime starts again from the archive. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    onTouchRef.current = onTouch;
    emotionRef.current = emotion;
    speakingRef.current = isSpeaking;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;
    let avatar: MeshAvatar | null = null;
    let stopSnapshots: (() => void) | null = null;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const [{ loadMeshAvatar }, bytes] = await Promise.all([import('mesh-avatar'), api.readFileBinary(modelPath)]);
        if (disposed) return;
        const loaded = await loadMeshAvatar(canvas, bytes);
        if (disposed) {
          loaded.destroy();
          return;
        }
        avatar = loaded;
        avatarRef.current = loaded;
        const tag = emotionRef.current;
        loaded.setEmotion(EMOTION_TAGS.has(tag) ? tag : null, { playMotion: false });
        loaded.setSpeaking(speakingRef.current);
        // The drawing buffer is kept (`preserveDrawingBuffer`): a snapshot reads the last frame.
        stopSnapshots = answerSnapshots(canvas, () => {});
        setLoading(false);
      } catch (err) {
        if (disposed) return;
        console.error('Mesh-Avatar konnte nicht geladen werden:', err);
        setError(errorMessage(err) || translate('avatar.meshLoadFailed'));
        setLoading(false);
      }
    };
    void load();

    // The voice's level moves the mouth (smoothed a little; the runtime shapes the syllables).
    let level = 0;
    const stopAudio = audioPlayer.onAudioFrame((amplitude) => {
      level = level * 0.4 + Math.min(1, amplitude * 1.6) * 0.6;
      avatar?.setVoiceLevel(level);
    });

    // Pointer: the eyes and head follow it; a short tap is a pat (upper part) or a poke.
    let down: { x: number; y: number; at: number } | null = null;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!avatar || rect.width === 0) return;
      const x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, -(((e.clientY - rect.top) / rect.height) * 2 - 1)));
      avatar.setParameters({ gazeX: x, gazeY: y, angleX: x * 12, angleY: y * 8 }, 0.7);
    };
    const onPointerLeave = () => avatar?.setParameters({});
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const onPointerUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MOVE || performance.now() - start.at > TAP_MS) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      // No hit mask: any tap counts, the upper part of the viewer as the head.
      avatar?.play(TAP_MOTIONS[Math.floor(Math.random() * TAP_MOTIONS.length)]!);
      onTouchRef.current?.({ zone: zoneInViewer(y, rect.height, 0.4), x: e.clientX - rect.left, y });
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      disposed = true;
      stopAudio();
      stopSnapshots?.();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      avatar?.destroy();
      avatarRef.current = null;
    };
  }, [modelPath, generation]);

  // The mood of the reply: its expression (with the runtime's motion for it).
  useEffect(() => {
    avatarRef.current?.setEmotion(EMOTION_TAGS.has(emotion) ? emotion : null, { playMotion: true });
  }, [emotion]);

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    avatar.setSpeaking(isSpeaking);
    if (!isSpeaking) avatar.setVoiceLevel(0);
  }, [isSpeaking]);

  useEffect(() => {
    const motion = gesture?.role ? GESTURE_MOTIONS[gesture.role] : undefined;
    if (motion) avatarRef.current?.play(motion);
  }, [gesture]);

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none bg-app/60"
      data-mesh-viewer={loading ? 'loading' : error ? 'error' : 'ready'}
    >
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app/70 backdrop-blur-sm gap-2 text-accent-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-medium text-slate-300">{t('avatar.meshLoading')}</span>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-x-6 top-6 z-20 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 backdrop-blur-md">
          <p className="font-semibold mb-1">{t('avatar.meshError')}</p>
          <p>{error}</p>
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60 backdrop-blur shadow-lg text-slate-300">
        <button
          type="button"
          onClick={() => avatarRef.current?.play(TAP_MOTIONS[Math.floor(Math.random() * TAP_MOTIONS.length)]!)}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.playMotion')}
          aria-label={t('avatar.playMotion')}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setGeneration((g) => g + 1)}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.meshReload')}
          aria-label={t('avatar.meshReload')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
};

export default MeshAvatarViewer;
