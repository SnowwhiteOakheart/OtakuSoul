import { headZoneEnd, touchZoneAt, type TouchZone } from '../companion/petBehavior';

/** A press that moves more than this (px) is a drag (turning or moving the figure), not a tap. */
export const TAP_MAX_MOVE_PX = 6;
/** …and one that lasts longer than this (ms) is a hold. */
export const TAP_MAX_MS = 500;

/** A touch on the figure: where (CSS px in the viewer) and what part (head: pat, body: poke). */
export interface FigureTouch {
  zone: TouchZone;
  x: number;
  y: number;
}

/** Whether a press from `down` to `up` is a tap. */
export function isTap(
  down: { x: number; y: number; t: number },
  up: { x: number; y: number; t: number },
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_MOVE_PX && up.t - down.t <= TAP_MAX_MS;
}

/**
 * Calls `onTap` (client coordinates) for each tap with the main button on `element`; drags and
 * holds are left to the viewer's own controls. Returns the stop function.
 */
export function watchTaps(element: HTMLElement, onTap: (clientX: number, clientY: number) => void): () => void {
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const handleDown = (e: PointerEvent) => {
    down = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
  };
  const handleUp = (e: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || start.id !== e.pointerId) return;
    if (isTap(start, { x: e.clientX, y: e.clientY, t: performance.now() })) onTap(e.clientX, e.clientY);
  };
  const handleCancel = () => {
    down = null;
  };
  element.addEventListener('pointerdown', handleDown);
  element.addEventListener('pointerup', handleUp);
  element.addEventListener('pointercancel', handleCancel);
  return () => {
    element.removeEventListener('pointerdown', handleDown);
    element.removeEventListener('pointerup', handleUp);
    element.removeEventListener('pointercancel', handleCancel);
  };
}

/** The part touched at `y` px of a `height` px tall viewer, given the head line (share from the top) if known. */
export function zoneInViewer(y: number, height: number, headLine: number | null): TouchZone {
  return touchZoneAt(y / Math.max(1, height), headZoneEnd(headLine));
}
