import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Application, extensions } from 'pixi.js';
// Lets pixi.js compile shaders without `eval`, so the CSP can forbid 'unsafe-eval'.
import 'pixi.js/unsafe-eval';
import { Live2DModel, Live2DPlugin, ModelSettings } from 'untitled-pixi-live2d-engine/cubism';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/useAppStore';
import { audioPlayer } from '../../services/audioPlayer';
import { loadLive2DViewState, saveLive2DViewState } from '../../services/avatarViewState';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { translate, useTranslation } from '../../i18n';

// The Live2D render pipe must be registered before any renderer is created.
extensions.add(Live2DPlugin);

// Path normalization helper for resolving relative model assets
function normalizePath(parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

// Monkey-patch ModelSettings.prototype.resolveURL to correctly handle Tauri asset:// URLs
ModelSettings.prototype.resolveURL = function (targetPath: string): string {
  if (!targetPath) return targetPath;

  // Don't modify absolute URLs or special protocols
  if (
    targetPath.startsWith('data:') ||
    targetPath.startsWith('blob:') ||
    targetPath.startsWith('http://') ||
    targetPath.startsWith('https://') ||
    targetPath.startsWith('asset://')
  ) {
    return targetPath;
  }

  const settingsUrl = this.url;
  if (!settingsUrl) {
    return targetPath;
  }

  // Handle Tauri asset URLs
  const isAsset = settingsUrl.startsWith('asset://') || settingsUrl.startsWith('http://asset.localhost');
  let basePath = settingsUrl;

  if (isAsset) {
    try {
      basePath = decodeURIComponent(settingsUrl);
    } catch {}

    if (basePath.startsWith('asset://localhost/')) {
      basePath = basePath.slice('asset://localhost/'.length);
    } else if (basePath.startsWith('http://asset.localhost/')) {
      basePath = basePath.slice('http://asset.localhost/'.length);
    } else if (basePath.startsWith('asset://')) {
      basePath = basePath.slice('asset://'.length);
    }
  }

  // Ensure leading slash on Unix systems
  if (!basePath.startsWith('/') && !/^[a-zA-Z]:/.test(basePath)) {
    basePath = '/' + basePath;
  }

  // Extract directory path of the settings file
  const lastSlash = basePath.lastIndexOf('/');
  const baseDir = lastSlash !== -1 ? basePath.substring(0, lastSlash) : '';

  // Handle GoEmotions expression paths from Soul-of-Waifu
  // Format: ../../../../app/utils/emotions/live2d/expressions/xxx_animation.exp3.json
  if (targetPath.includes('emotions/live2d/expressions/') || targetPath.endsWith('_animation.exp3.json')) {
    const filename = targetPath.slice(targetPath.lastIndexOf('/') + 1);
    const assetsMarker = '/assets/live2d';
    const idx = baseDir.indexOf(assetsMarker);
    if (idx !== -1) {
      const rootAssets = baseDir.substring(0, idx) + '/assets';
      const expPath = `${rootAssets}/emotions/live2d/expressions/${filename}`;
      return convertFileSrc(expPath);
    }
    // Model lives outside the bundled assets (e.g. user data dir): use the bundled emotion set.
    const bundledVrmDir = useAppStore.getState().appPaths?.bundled_vrm_dir?.replace(/\\/g, '/');
    if (bundledVrmDir) {
      const bundledAssets = bundledVrmDir.replace(/\/vrm\/?$/, '');
      return convertFileSrc(`${bundledAssets}/emotions/live2d/expressions/${filename}`);
    }
    return targetPath;
  }

  // Standard relative file path resolution
  const cleanTarget = targetPath.replace(/\\/g, '/');
  const resolved = '/' + normalizePath([...baseDir.split('/'), ...cleanTarget.split('/')]);

  return convertFileSrc(resolved);
};

/**
 * Applies a GoEmotions label. Imported Soul-of-Waifu models name their expressions after the
 * emotion ("joy"), older exports use "joy_animation"; a motion group of the same name is the fallback.
 */
const applyEmotion = async (model: Live2DModel, emotion: string) => {
  try {
    if (await model.expression(emotion)) return;
    if (await model.expression(`${emotion}_animation`)) return;
    await model.motion(emotion);
  } catch (err) {
    console.warn('Could not set expression on Live2D model:', err);
  }
};

/** Plays the "Tap" motion group, or "Idle" for models without one. */
const playTapMotion = async (model: Live2DModel) => {
  try {
    if (!(await model.motion('Tap'))) await model.motion('Idle');
  } catch (e) {
    console.warn('Motion error:', e);
  }
};

interface Live2DViewerProps {
  modelPath: string; // Absolute path to .model3.json or .model.json
  emotion?: string;  // e.g. "joy", "anger", "sadness", "surprise", etc.
  isSpeaking?: boolean;
}

export const Live2DViewer: React.FC<Live2DViewerProps> = ({
  modelPath,
  emotion = 'neutral',
  isSpeaking: _isSpeaking = false,
}) => {
  const { t, tEmotion } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const baseScaleRef = useRef(1);

  const modelRef = useRef<Live2DModel | null>(null);
  const appRef = useRef<Application | null>(null);
  const currentEmotionRef = useRef(emotion);
  useLayoutEffect(() => {
    currentEmotionRef.current = emotion;
  }, [emotion]);

  // React to emotion changes
  useEffect(() => {
    if (!modelRef.current) return;
    const model = modelRef.current;
    
    void applyEmotion(model, emotion);
  }, [emotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !modelPath) return;

    let isDisposed = false;
    setLoading(true);
    setError(null);

    const app = new Application();
    appRef.current = app;
    const appReady = app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
    });

    let cleanupAudio: (() => void) | null = null;
    let saveTimer: number | null = null;

    const saveViewState = () => {
      const model = modelRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!model || width <= 0 || height <= 0 || baseScaleRef.current <= 0) return;
      saveLive2DViewState(modelPath, {
        xRatio: model.x / width,
        yRatio: model.y / height,
        zoom: model.scale.x / baseScaleRef.current,
      });
    };

    const scheduleViewSave = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveViewState();
      }, 150);
    };

    const init = async () => {
      try {
        await appReady;
        if (isDisposed) return;

        container.appendChild(app.canvas);

        // Convert filesystem path to Tauri Asset URL
        const assetUrl = convertFileSrc(modelPath);

        // Load the Live2D model
        // Pointer handling (drag, zoom, tap, look-at) is done by the listeners below.
        const model = await Live2DModel.from(assetUrl, {
          autoHitTest: false,
          autoFocus: false,
        });

        if (isDisposed) {
          try {
            model.destroy();
          } catch {}
          return;
        }

        modelRef.current = model;

        // Center and scale model appropriately
        const bounds = model.getBounds();
        const containerWidth = container.clientWidth || 300;
        const containerHeight = container.clientHeight || 500;

        const baseScale = Math.min(
          (containerWidth * 0.85) / bounds.width,
          (containerHeight * 0.85) / bounds.height
        );
        baseScaleRef.current = baseScale;

        const savedView = loadLive2DViewState(modelPath);

        model.scale.set(baseScale * (savedView?.zoom ?? 1));
        model.anchor.set(0.5, 0.5);
        model.x = containerWidth * (savedView?.xRatio ?? 0.5);
        model.y = containerHeight * (savedView?.yRatio ?? 0.55);

        app.stage.addChild(model);

        // LipSync via Web Audio API amplitude
        cleanupAudio = audioPlayer.onAudioFrame((amplitude) => {
          const core = model.internalModel?.coreModel as
            | { setParameterValueById?: (id: string, value: number) => void }
            | undefined;
          if (!core) return;
          try {
            core.setParameterValueById?.('ParamMouthOpenY', Math.min(1.0, amplitude * 2.2));
          } catch {}
        });

        // Set initial expression
        if (currentEmotionRef.current && currentEmotionRef.current !== 'neutral') {
          void applyEmotion(model, currentEmotionRef.current);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load Live2D model:', err);
        if (!isDisposed) {
          setError(
            err instanceof Error
              ? err.message
              : translate('avatar.live2dLoadFailed')
          );
          setLoading(false);
        }
      }
    };

    void init();

    // Click on canvas to trigger Tap motion
    const handleCanvasClick = (e: MouseEvent) => {
      if (!modelRef.current || !container) return;
      // A pointer drag ends before the synthetic click event fires. Remember the
      // completed drag separately so repositioning the model never triggers a motion.
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      try {
        const model = modelRef.current;
        const bounds = model.getBounds();
        const insideBounds =
          x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
        if (model.hitTest(x, y).length > 0 || insideBounds) {
          void playTapMotion(model);
        }
      } catch {}
    };

    // Mouse tracking (look at cursor)
    const handlePointerMove = (e: PointerEvent) => {
      if (!modelRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (isDraggingRef.current) {
        const dx = x - dragStartRef.current.x;
        const dy = y - dragStartRef.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) didDragRef.current = true;
        dragStartRef.current = { x, y };
        modelRef.current.x += dx;
        modelRef.current.y += dy;
        return;
      }

      try {
        modelRef.current.focus(x, y);
      } catch {}
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      isDraggingRef.current = true;
      didDragRef.current = false;
      const rect = container.getBoundingClientRect();
      dragStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      container.setPointerCapture?.(e.pointerId);
    };

    const handlePointerUp = (e: PointerEvent) => {
      isDraggingRef.current = false;
      if (container.hasPointerCapture?.(e.pointerId)) {
        container.releasePointerCapture(e.pointerId);
      }
      // Browsers normally dispatch click immediately after pointerup. Clear the
      // guard on the next task as a fallback when a platform suppresses that click.
      if (didDragRef.current) {
        scheduleViewSave();
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!modelRef.current) return;
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const currentZoom = modelRef.current.scale.x / baseScaleRef.current;
      const nextZoom = Math.min(8, Math.max(0.1, currentZoom * zoomFactor));
      modelRef.current.scale.set(baseScaleRef.current * nextZoom);
      scheduleViewSave();
    };

    container.addEventListener('click', handleCanvasClick);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      isDisposed = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveViewState();
      if (cleanupAudio) cleanupAudio();
      container.removeEventListener('click', handleCanvasClick);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);

      if (modelRef.current) {
        try {
          modelRef.current.destroy();
        } catch {}
        modelRef.current = null;
      }

      // pixi v8 cannot destroy an application whose async init is still running.
      void appReady
        .catch(() => {})
        .then(() => {
          try {
            app.destroy({ removeView: true }, { children: true });
          } catch {}
        });
      appRef.current = null;

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [modelPath]);

  const handleResetView = () => {
    if (!modelRef.current || !containerRef.current) return;
    const container = containerRef.current;
    modelRef.current.scale.set(baseScaleRef.current);
    modelRef.current.x = container.clientWidth / 2;
    modelRef.current.y = container.clientHeight / 2 + container.clientHeight * 0.05;
    saveLive2DViewState(modelPath, { xRatio: 0.5, yRatio: 0.55, zoom: 1 });
  };

  const handleTriggerRandomMotion = () => {
    if (!modelRef.current) return;
    void playTapMotion(modelRef.current);
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-app/60 select-none">
      {/* 2D PixiJS Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app/70 backdrop-blur-sm gap-2 text-accent-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-medium text-slate-300">{t('avatar.live2dModelLoading')}</span>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div className="absolute inset-x-6 top-6 z-20 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 backdrop-blur-md">
          <p className="font-semibold mb-1">{t('avatar.live2dError')}</p>
          <p>{error}</p>
        </div>
      )}

      {/* Controls Overlay Bottom-Right */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60 backdrop-blur shadow-lg text-slate-300">
        <button
          onClick={handleTriggerRandomMotion}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.playMotion')}
          aria-label={t('avatar.playMotion')}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1.5 hover:text-accent-400 hover:bg-slate-800 rounded-lg transition-colors text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('avatar.resetView')}
          aria-label={t('avatar.resetView')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Current Emotion Indicator Top-Left */}
      {emotion && emotion !== 'neutral' && (
        <div className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-accent-950/60 border border-accent-500/30 rounded-lg backdrop-blur text-xs text-accent-300 font-mono shadow-md flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
          <span>{tEmotion(emotion)}</span>
        </div>
      )}
    </div>
  );
};
