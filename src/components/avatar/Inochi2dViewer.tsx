import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { answerSnapshots } from '../../services/avatarSnapshot';
import { loadLive2DViewState, saveLive2DViewState } from '../../services/avatarViewState';
import { PuppetAnimator } from '../../services/inochi2d/controls';
import { parseInp } from '../../services/inochi2d/inp';
import { identity, multiply, ortho } from '../../services/inochi2d/math';
import { Puppet } from '../../services/inochi2d/puppet';
import { decodeTextures, PuppetRenderer } from '../../services/inochi2d/renderer';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';

interface Inochi2dViewerProps {
  /** Absolute path of the `.inp`/`.inx` file. */
  modelPath: string;
  /** GoEmotions label (or an extra mood such as "blush"). */
  emotion?: string;
  isSpeaking?: boolean;
}

/** Voice frames older than this count as silence (the mouth closes). */
const AUDIO_TIMEOUT_MS = 180;
/** Tall figures start framed from the head to the hips instead of shown whole. */
const UPPER_BODY_ZOOM = 1.8;

interface View {
  /** Screen position of the model's centre as a share of the viewer's size. */
  xRatio: number;
  yRatio: number;
  zoom: number;
}

/**
 * Inochi2D puppet in the chat and the avatar library: WebGL2 canvas, drag to move, wheel to zoom,
 * lips follow the voice, face follows the emotion, eyes and head follow the pointer.
 */
export const Inochi2dViewer: React.FC<Inochi2dViewerProps> = ({ modelPath, emotion = 'neutral', isSpeaking: _isSpeaking = false }) => {
  const { t, tEmotion } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A lost GPU context loads the puppet again.
  const [generation, setGeneration] = useState(0);
  const animatorRef = useRef<PuppetAnimator | null>(null);
  const viewRef = useRef<View | null>(null);
  const defaultViewRef = useRef<View>({ xRatio: 0.5, yRatio: 0.5, zoom: 1 });
  const emotionRef = useRef(emotion);

  useLayoutEffect(() => {
    emotionRef.current = emotion;
    if (animatorRef.current) animatorRef.current.emotion = emotion;
  }, [emotion]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !modelPath) return;
    let disposed = false;
    let frame = 0;
    let renderer: PuppetRenderer | null = null;
    let stopSnapshots: (() => void) | null = null;
    let saveTimer: number | null = null;
    const abort = new AbortController();
    setLoading(true);
    setError(null);

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: false,
    });

    const saveView = () => {
      if (viewRef.current) saveLive2DViewState(modelPath, viewRef.current, 'inochi2d');
    };
    const scheduleSave = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveView();
      }, 200);
    };

    let puppet: Puppet | null = null;
    let bounds: [number, number, number, number] = [-1, -1, 1, 1];
    let lastAudio = 0;
    const stopAudio = audioPlayer.onAudioFrame((amplitude) => {
      lastAudio = performance.now();
      if (animatorRef.current) animatorRef.current.level = amplitude;
    });

    /** Fits the canvas to the viewer (device pixels, at most 2× for speed). */
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(container.clientWidth * ratio));
      const height = Math.max(1, Math.round(container.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    /** Scale that shows the whole puppet in the viewer (zoom 1). */
    const fitScale = () => {
      const [x0, y0, x1, y1] = bounds;
      return Math.min((canvas.width * 0.92) / Math.max(x1 - x0, 1), (canvas.height * 0.92) / Math.max(y1 - y0, 1));
    };

    const draw = () => {
      if (!renderer || !puppet || !gl) return;
      resize();
      const view = viewRef.current ?? defaultViewRef.current;
      const scale = fitScale() * view.zoom;
      const [x0, y0, x1, y1] = bounds;
      const m = identity();
      m[0] = scale;
      m[5] = scale;
      m[12] = canvas.width * view.xRatio - scale * ((x0 + x1) / 2);
      m[13] = canvas.height * view.yRatio - scale * ((y0 + y1) / 2);
      renderer.render(multiply(identity(), ortho(canvas.width, canvas.height), m), canvas.width, canvas.height);
    };

    let last = 0;
    const loop = (now: number) => {
      if (disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const animator = animatorRef.current;
      if (animator && puppet) {
        if (now - lastAudio > AUDIO_TIMEOUT_MS) animator.level = 0;
        animator.update(dt);
        puppet.update(dt);
        draw();
      }
      frame = requestAnimationFrame(loop);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      renderer = null;
    };
    const onContextRestored = () => setGeneration((g) => g + 1);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const load = async () => {
      try {
        if (!gl) throw new Error(translate('avatar.inochi2dNoWebgl'));
        const bytes = await api.readFileBinary(modelPath);
        if (disposed) return;
        const file = parseInp(bytes);
        puppet = new Puppet(file);
        const animator = new PuppetAnimator(puppet);
        animator.emotion = emotionRef.current;
        animatorRef.current = animator;
        const textures = await decodeTextures(file, abort.signal);
        if (disposed) return;
        renderer = new PuppetRenderer(gl, puppet, textures);
        // Framing from the rest pose: tall figures start at the upper body.
        bounds = puppet.bounds() ?? bounds;
        resize();
        const [x0, y0, x1, y1] = bounds;
        const tall = (y1 - y0) / Math.max(x1 - x0, 1) > 1.4 && canvas.height / Math.max(canvas.width, 1) < 2.2;
        const zoom = tall ? UPPER_BODY_ZOOM : 1;
        const shown = (y1 - y0) * fitScale() * zoom;
        defaultViewRef.current = { xRatio: 0.5, yRatio: tall ? (canvas.height * 0.03 + shown / 2) / canvas.height : 0.5, zoom };
        viewRef.current = loadLive2DViewState(modelPath, 'inochi2d') ?? { ...defaultViewRef.current };
        stopSnapshots = answerSnapshots(canvas, draw);
        setLoading(false);
        frame = requestAnimationFrame(loop);
      } catch (err) {
        if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('Inochi2D-Modell konnte nicht geladen werden:', err);
        setError(errorMessage(err) || translate('avatar.inochi2dLoadFailed'));
        setLoading(false);
      }
    };
    void load();

    // Pointer: drag moves the figure, the eyes follow the pointer, wheel zooms.
    let dragging = false;
    let dragStart = { x: 0, y: 0 };
    let moved = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      dragStart = { x: e.clientX, y: e.clientY };
      container.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const animator = animatorRef.current;
      if (animator && rect.width > 0) {
        animator.pointer = [((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1];
      }
      if (!dragging || !viewRef.current || rect.width === 0) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
      dragStart = { x: e.clientX, y: e.clientY };
      viewRef.current = { ...viewRef.current, xRatio: viewRef.current.xRatio + dx / rect.width, yRatio: viewRef.current.yRatio + dy / rect.height };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (container.hasPointerCapture?.(e.pointerId)) container.releasePointerCapture(e.pointerId);
      if (dragging && moved) scheduleSave();
      else if (dragging) animatorRef.current?.poke();
      dragging = false;
    };
    const onPointerLeave = () => {
      if (animatorRef.current) animatorRef.current.pointer = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = viewRef.current;
      if (!view) return;
      const zoom = Math.min(8, Math.max(0.2, view.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
      viewRef.current = { ...view, zoom };
      scheduleSave();
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveView();
      stopAudio();
      stopSnapshots?.();
      renderer?.dispose();
      animatorRef.current = null;
      viewRef.current = null;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('wheel', onWheel);
    };
  }, [modelPath, generation]);

  const resetView = () => {
    viewRef.current = { ...defaultViewRef.current };
    saveLive2DViewState(modelPath, viewRef.current, 'inochi2d');
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-app/60 select-none" data-inochi2d-viewer={loading ? 'loading' : error ? 'error' : 'ready'}>
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app/70 backdrop-blur-sm gap-2 text-accent-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-medium text-slate-300">{t('avatar.inochi2dLoading')}</span>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-x-6 top-6 z-20 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 backdrop-blur-md">
          <p className="font-semibold mb-1">{t('avatar.inochi2dError')}</p>
          <p>{error}</p>
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60 backdrop-blur shadow-lg text-slate-300">
        <button
          type="button"
          onClick={() => animatorRef.current?.poke()}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.playMotion')}
          aria-label={t('avatar.playMotion')}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.resetView')}
          aria-label={t('avatar.resetView')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {emotion && emotion !== 'neutral' && (
        <div className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-accent-950/60 border border-accent-500/30 rounded-lg backdrop-blur text-xs text-accent-300 font-mono shadow-md flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-400" />
          <span>{tEmotion(emotion)}</span>
        </div>
      )}
    </div>
  );
};

export default Inochi2dViewer;
