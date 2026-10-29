import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { mouthFrame, talkingSet, TALKING_PORTRAIT_EVENT } from '../../services/talkingPortrait';
import type { Visemes } from '../../services/lipSync';
import type { HeadPlacement } from '../../types/generated/HeadPlacement';
import type { TalkingSet } from '../../types/generated/TalkingSet';
import { createBlinker } from './avatarStage';

/**
 * The speaking frames of a character's picture, once its head placement is set and the models
 * are there; null otherwise (the portrait stays still). Made in the background on first use.
 */
export function useTalkingSet(characterId: string | undefined, src: string): TalkingSet | null {
  const [placement, setPlacement] = useState<HeadPlacement | null>(null);
  const [set, setSet] = useState<TalkingSet | null>(null);

  useEffect(() => {
    if (!characterId) return undefined;
    let cancelled = false;
    const load = () =>
      Promise.all([api.getTalkingPortraitPlacement(characterId), api.talkingPortraitStatus()])
        .then(([found, status]) => {
          if (!cancelled) setPlacement(status?.ready ? (found ?? null) : null);
        })
        .catch(() => {
          if (!cancelled) setPlacement(null);
        });
    void load();
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === characterId) void load();
    };
    window.addEventListener(TALKING_PORTRAIT_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(TALKING_PORTRAIT_EVENT, onChange);
    };
  }, [characterId]);

  useEffect(() => {
    setSet(null);
    if (!placement || !src) return undefined;
    let cancelled = false;
    talkingSet(src, placement)
      .then((made) => {
        if (!cancelled) setSet(made);
      })
      .catch((e) => console.warn('Sprechendes Porträt nicht erzeugt:', e));
    return () => {
      cancelled = true;
    };
  }, [placement, src]);

  return set;
}

/**
 * The frames over the portrait: a canvas the picture's size (laid out like the picture, so its
 * `object-fit` crops both the same way) that shows the patch of the current mouth shape, and a
 * blink now and then.
 */
export function TalkingOverlay({ set, isSpeaking, className }: { set: TalkingSet; isSpeaking: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    const images = new Map<string, HTMLImageElement>();
    for (const [name, frame] of Object.entries(set.frames)) {
      const image = new Image();
      image.src = frame.image;
      images.set(name, image);
    }
    let shown: string | null = null;
    let mouth: string | null = null;
    let level = 0;
    const blink = createBlinker();
    const start = performance.now();
    const draw = () => {
      const blinking = !mouth && blink((performance.now() - start) / 1000) > 0.5;
      const next = mouth ?? (blinking && images.has('blink') ? 'blink' : null);
      if (next === shown) return;
      shown = next;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const frame = next ? set.frames[next] : undefined;
      const image = next ? images.get(next) : undefined;
      if (frame && image?.complete) context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
    };
    const stopFrames = isSpeaking
      ? audioPlayer.onAudioFrame((amplitude: number, visemes: Visemes | null) => {
          level = level * 0.5 + amplitude * 0.5;
          mouth = mouthFrame(visemes, level, set.frames);
          draw();
        })
      : () => {};
    const timer = window.setInterval(() => {
      if (!isSpeaking) mouth = null;
      draw();
    }, 50);
    return () => {
      stopFrames();
      window.clearInterval(timer);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [set, isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      width={set.width}
      height={set.height}
      aria-hidden
      data-talking-portrait
      className={className ?? 'absolute inset-0 w-full h-full object-cover pointer-events-none'}
    />
  );
}
