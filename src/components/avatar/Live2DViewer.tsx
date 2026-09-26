import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel, ModelSettings } from 'pixi-live2d-display/cubism4';
import { convertFileSrc } from '@tauri-apps/api/core';
import { audioPlayer } from '../../services/audioPlayer';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';

// Register PIXI ticker for Live2D animations
try {
  Live2DModel.registerTicker(PIXI.Ticker as any);
} catch (e) {
  console.warn('Live2D ticker already registered or failed:', e);
}

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
    const otakusoulExpPath = `/home/deathtrap/development/OtakuSoul/assets/emotions/live2d/expressions/${filename}`;
    return convertFileSrc(otakusoulExpPath);
  }

  // Standard relative file path resolution
  const cleanTarget = targetPath.replace(/\\/g, '/');
  const resolved = '/' + normalizePath([...baseDir.split('/'), ...cleanTarget.split('/')]);

  return convertFileSrc(resolved);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const modelRef = useRef<any>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const currentEmotionRef = useRef(emotion);
  currentEmotionRef.current = emotion;

  // React to emotion changes
  useEffect(() => {
    if (!modelRef.current) return;
    const model = modelRef.current;
    
    // Try setting expression on model
    try {
      const expName = `${emotion}_animation`;
      if (model.expression) {
        model.expression(expName).catch(() => {
          // If named expression file not embedded, fallback to standard group
          try {
            model.motion(emotion).catch(() => {});
          } catch {}
        });
      }
    } catch (err) {
      console.warn('Could not set expression on Live2D model:', err);
    }
  }, [emotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !modelPath) return;

    let isDisposed = false;
    setLoading(true);
    setError(null);

    const app = new PIXI.Application({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    appRef.current = app;

    let cleanupAudio: (() => void) | null = null;

    const init = async () => {
      try {
        if (isDisposed) return;

        container.appendChild(app.view as HTMLCanvasElement);

        // Convert filesystem path to Tauri Asset URL
        const assetUrl = convertFileSrc(modelPath);

        // Load the Live2D model
        const model = await Live2DModel.from(assetUrl, {
          autoInteract: false,
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

        model.scale.set(baseScale);
        model.anchor.set(0.5, 0.5);
        model.x = containerWidth / 2;
        model.y = containerHeight / 2 + containerHeight * 0.05;

        (app.stage as any).addChild(model);

        // LipSync via Web Audio API amplitude
        cleanupAudio = audioPlayer.onAudioFrame((amplitude) => {
          if (!model || !model.internalModel?.coreModel) return;
          try {
            const mouthValue = Math.min(1.0, amplitude * 2.2);
            const core = model.internalModel.coreModel as any;
            // Cubism 3/4 parameter
            core.setParameterValueById?.('ParamMouthOpenY', mouthValue);
            // Cubism 2 parameter fallback
            core.setParamFloat?.('PARAM_MOUTH_OPEN_Y', mouthValue);
          } catch {}
        });

        // Set initial expression
        if (currentEmotionRef.current && currentEmotionRef.current !== 'neutral') {
          try {
            model.expression?.(`${currentEmotionRef.current}_animation`);
          } catch {}
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load Live2D model:', err);
        if (!isDisposed) {
          setError(
            err instanceof Error
              ? err.message
              : 'Live2D-Modell konnte nicht geladen werden.'
          );
          setLoading(false);
        }
      }
    };

    void init();

    // Click on canvas to trigger Tap motion
    const handleCanvasClick = (e: MouseEvent) => {
      if (!modelRef.current || !container) return;
      if (isDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      try {
        if (modelRef.current.hitTest) {
          const hitAreas = modelRef.current.hitTest(x, y);
          if (hitAreas && hitAreas.length > 0) {
            modelRef.current.motion('Tap') || modelRef.current.motion('Idle');
            return;
          }
        }
        const bounds = modelRef.current.getBounds();
        if (
          x >= bounds.x &&
          x <= bounds.x + bounds.width &&
          y >= bounds.y &&
          y <= bounds.y + bounds.height
        ) {
          modelRef.current.motion('Tap') || modelRef.current.motion('Idle');
        }
      } catch {}
    };

    // Mouse tracking (look at cursor)
    const handleMouseMove = (e: MouseEvent) => {
      if (!modelRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (isDraggingRef.current) {
        const dx = x - dragStartRef.current.x;
        const dy = y - dragStartRef.current.y;
        dragStartRef.current = { x, y };
        if (modelRef.current) {
          modelRef.current.x += dx;
          modelRef.current.y += dy;
        }
        return;
      }

      try {
        modelRef.current.focus(x, y);
      } catch {}
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && e.shiftKey) {
        isDraggingRef.current = true;
        const rect = container.getBoundingClientRect();
        dragStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!modelRef.current) return;
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      modelRef.current.scale.x *= zoomFactor;
      modelRef.current.scale.y *= zoomFactor;
    };

    container.addEventListener('click', handleCanvasClick);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      isDisposed = true;
      if (cleanupAudio) cleanupAudio();
      container.removeEventListener('click', handleCanvasClick);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);

      if (modelRef.current) {
        try {
          modelRef.current.destroy();
        } catch {}
        modelRef.current = null;
      }

      if (appRef.current) {
        try {
          appRef.current.destroy(true, { children: true });
        } catch {}
        appRef.current = null;
      }

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [modelPath]);

  const handleResetView = () => {
    if (!modelRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const bounds = modelRef.current.getBounds();
    const baseScale = Math.min(
      (container.clientWidth * 0.85) / bounds.width,
      (container.clientHeight * 0.85) / bounds.height
    );
    modelRef.current.scale.set(baseScale);
    modelRef.current.x = container.clientWidth / 2;
    modelRef.current.y = container.clientHeight / 2 + container.clientHeight * 0.05;
  };

  const handleTriggerRandomMotion = () => {
    if (!modelRef.current) return;
    try {
      modelRef.current.motion('Tap') || modelRef.current.motion('Idle');
    } catch (e) {
      console.warn('Motion error:', e);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-slate-950/60 select-none">
      {/* 2D PixiJS Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm gap-2 text-purple-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-medium text-slate-300">
            Live2D-Modell wird geladen...
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div className="absolute inset-x-6 top-6 z-20 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 backdrop-blur-md">
          <p className="font-semibold mb-1">Live2D-Fehler</p>
          <p>{error}</p>
        </div>
      )}

      {/* Controls Overlay Bottom-Right */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60 backdrop-blur shadow-lg text-slate-300">
        <button
          onClick={handleTriggerRandomMotion}
          className="p-1.5 hover:text-purple-400 hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
          title="Animation abspielen"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1.5 hover:text-purple-400 hover:bg-slate-800 rounded-lg transition-colors text-xs"
          title="Ansicht zurücksetzen"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Current Emotion Indicator Top-Left */}
      {emotion && emotion !== 'neutral' && (
        <div className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-purple-950/60 border border-purple-500/30 rounded-lg backdrop-blur text-[11px] text-purple-300 font-mono shadow-md flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          <span className="capitalize">{emotion}</span>
        </div>
      )}
    </div>
  );
};
