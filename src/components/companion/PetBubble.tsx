import { useEffect, useRef } from 'react';
import type { BubbleSide } from './petBehavior';

/** A long sentence starts scrolling this long after it shows, and ends this long before it goes. */
const SCROLL_PAUSE_MS = 900;
/** Room above the head (px) the bubble needs to sit there; less and it shows at the top as before. */
const MIN_ROOM_PX = 52;
/** Gap between the tail's tip and the top of the figure (px). */
const HEAD_GAP_PX = 10;

/** Margin of the bubble inside the pet's own width (px, each side). */
const SIDE_MARGIN_PX = 12;
/** How far the bubble leans towards the screen's middle near an edge (px). */
const LEAN_PX: Record<BubbleSide, number> = { center: 0, left: -10, right: 10 };

interface PetBubbleProps {
  text: string;
  /** How long it shows (ms): a sentence too long for the bubble scrolls through in that time. */
  ms: number;
  side: BubbleSide;
  /** Free room above the figure: share of the window height from the top to the head. */
  room: number;
  /**
   * The pet's own width (logical px). The window widens while the figure hangs, is dragged by a
   * foot or shows the menu; the bubble keeps this width, centred over the head, so it never
   * flashes wide.
   */
  width: number;
  title: string;
  onClick: () => void;
}

/**
 * The desktop pet's speech bubble: above the head with a tail down to it, leaning towards the
 * screen's middle when the figure stands near an edge. It grows upwards only as far as the room
 * above the head allows; longer sentences scroll by themselves (or by wheel). A figure that fills
 * the window (zoomed in) leaves no room: then the bubble sits at the top as before.
 */
export function PetBubble({ text, ms, side, room, width, title, onClick }: PetBubbleProps) {
  const scrollRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    element.scrollTop = 0;
    const overflow = element.scrollHeight - element.clientHeight;
    if (overflow <= 1 || ms <= 0) return undefined;
    const start = performance.now() + SCROLL_PAUSE_MS;
    const span = Math.max(1000, ms - SCROLL_PAUSE_MS * 2);
    let frame = 0;
    // Scrolled by hand: the reader sets the pace from here.
    let byHand = false;
    const stop = () => {
      byHand = true;
    };
    const step = (now: number) => {
      if (byHand) return;
      const progress = (now - start) / span;
      if (progress > 0) element.scrollTop = Math.min(1, progress) * overflow;
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    element.addEventListener('wheel', stop, { passive: true });
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('wheel', stop);
    };
  }, [text, ms]);

  const boxWidth = Math.max(80, width - SIDE_MARGIN_PX * 2);
  const lean = LEAN_PX[side];
  const roomPx = room * window.innerHeight - HEAD_GAP_PX;
  const aboveHead = roomPx >= MIN_ROOM_PX;
  return (
    <button
      type="button"
      data-pet-solid
      data-pet-bubble={side}
      data-pet-bubble-above-head={aboveHead}
      aria-live="polite"
      title={title}
      className={`absolute ${aboveHead ? '' : 'top-2'} rounded-2xl bg-app/95 border border-accent-500/40 px-3 py-2 text-left text-xs text-slate-100 shadow-lg`}
      style={{
        left: `calc(50% - ${boxWidth / 2}px + ${lean}px)`,
        width: boxWidth,
        ...(aboveHead ? { bottom: `calc(${(1 - room) * 100}% + ${HEAD_GAP_PX}px)` } : {}),
      }}
      onClick={onClick}
    >
      <span
        ref={scrollRef}
        className={`block overflow-y-auto overscroll-contain ${aboveHead ? '' : 'max-h-[32vh]'}`}
        // The window's top edge (8 px), the padding (16 px) and the border stay outside.
        style={aboveHead ? { maxHeight: `${Math.max(16, roomPx - 26)}px` } : undefined}
      >
        {text}
      </span>
      <span
        aria-hidden
        className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b border-accent-500/40 bg-inherit"
        // Under the window's middle, where the head is.
        style={{ left: boxWidth / 2 - lean }}
      />
    </button>
  );
}
