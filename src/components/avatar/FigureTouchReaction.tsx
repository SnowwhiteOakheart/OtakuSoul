import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { manualEmotion } from '../avatars/avatarMatch';
import type { FigureTouch } from './avatarTouch';

/** Touches closer together than this (ms) only show the sign; hormones and mood change once. */
export const TOUCH_COOLDOWN_MS = 3000;
/** How long the figure keeps the touched look (ms) before its own mood returns. */
export const TOUCH_MOOD_MS = 2500;
/** A pat makes the figure shy, a poke startles it. */
export const TOUCH_EMOTION = { head: 'embarrassment', body: 'surprise' } as const;
export const TOUCH_INTERACTION = { head: 'headpat', body: 'poke' } as const;

interface Flash extends FigureTouch {
  id: number;
}

/**
 * What a touch on the avatar in the chat does, as the pet does it: a pat on the head or a poke
 * changes the figure's hormones (`headpat`/`poke`) and gives it a moment's look of its own; the
 * sign (heart or spark) shows where it was touched. Returns the touch handler for the viewers and
 * the sign to draw.
 */
export function useFigureTouch() {
  const [flash, setFlash] = useState<Flash | null>(null);
  const lastReactionAt = useRef(0);
  const restore = useRef<number | null>(null);
  const flashId = useRef(0);

  useEffect(
    () => () => {
      if (restore.current !== null) window.clearTimeout(restore.current);
    },
    [],
  );

  const onTouch = useCallback((touch: FigureTouch) => {
    flashId.current += 1;
    setFlash({ ...touch, id: flashId.current });
    const now = Date.now();
    if (now - lastReactionAt.current < TOUCH_COOLDOWN_MS) return;
    lastReactionAt.current = now;
    const state = useAppStore.getState();
    void state.applyHormoneInteraction(TOUCH_INTERACTION[touch.zone]);
    const before = state.currentEmotion;
    const touched = manualEmotion(TOUCH_EMOTION[touch.zone]);
    state.setCurrentEmotion(touched);
    if (restore.current !== null) window.clearTimeout(restore.current);
    restore.current = window.setTimeout(() => {
      restore.current = null;
      // Only back if nothing else (a reply) changed the mood meanwhile.
      if (useAppStore.getState().currentEmotion === touched) useAppStore.getState().setCurrentEmotion(before);
    }, TOUCH_MOOD_MS);
  }, []);

  const clear = useCallback(() => setFlash(null), []);
  return { flash, onTouch, clear };
}

/** The sign at the touched place: rises and fades once (a brief fade with "reduce motion"). */
export const FigureTouchFlash: React.FC<{ flash: Flash | null; onDone: () => void }> = ({ flash, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!flash || !el || typeof el.animate !== 'function') return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const animation = el.animate(
      still
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
            { opacity: 1, transform: 'translate(-50%, -120%) scale(1.15)', offset: 0.35 },
            { opacity: 0, transform: 'translate(-50%, -220%) scale(1)' },
          ],
      { duration: still ? 500 : 900, fill: 'forwards' },
    );
    animation.onfinish = onDone;
    return () => animation.cancel();
  }, [flash, onDone]);
  if (!flash) return null;
  return (
    <div
      key={flash.id}
      ref={ref}
      aria-hidden="true"
      data-touch-zone={flash.zone}
      className="pointer-events-none absolute z-20 opacity-0"
      style={{ left: flash.x, top: flash.y }}
    >
      {flash.zone === 'head' ? (
        <Heart className="w-7 h-7 text-pink-400 fill-pink-400/70 drop-shadow" />
      ) : (
        <Zap className="w-7 h-7 text-amber-300 fill-amber-300/70 drop-shadow" />
      )}
    </div>
  );
};
