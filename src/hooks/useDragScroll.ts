import { useEffect, useRef, type RefObject } from 'react';

/** Ab dieser Mausbewegung (px) gilt ein Drücken als Ziehen statt als Klick. */
const DRAG_THRESHOLD = 6;
/** Abbremsung des Nachschwungs pro Frame (~60 fps). */
const FRICTION = 0.94;
const MIN_VELOCITY = 0.05;

/** Elemente, auf denen Drücken weiterhin normal wirkt (Text markieren, Eingaben, Regler). */
const IGNORE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [draggable="true"], [data-no-drag-scroll], canvas, video, audio';

/**
 * Touch-artiges Scrollen mit der Maus: gedrückt halten und ziehen verschiebt den
 * Inhalt senkrecht, beim Loslassen läuft er kurz nach. Klicks bleiben Klicks,
 * solange die Maus sich kaum bewegt; nach einem echten Zug wird der Klick verschluckt.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>, enabled = true) {
  const attached = useRef<{ el: HTMLElement; detach: () => void } | null>(null);

  // Ohne Abhängigkeiten: Das Element kann erst nach späteren Renders erscheinen
  // oder ausgetauscht werden (z. B. erst nach Auswahl eines Lorebooks).
  useEffect(() => {
    const el = enabled ? ref.current : null;
    if (attached.current?.el === el) return;
    attached.current?.detach();
    attached.current = el ? { el, detach: attachDragScroll(el) } : null;
  });

  useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
    },
    [],
  );
}

export function attachDragScroll(el: HTMLElement): () => void {
  let pointerId: number | null = null;
  let startY = 0;
  let startScroll = 0;
  let dragging = false;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let frame = 0;

  const stopMomentum = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const momentum = () => {
    velocity *= FRICTION;
    if (Math.abs(velocity) < MIN_VELOCITY) {
      frame = 0;
      return;
    }
    const before = el.scrollTop;
    el.scrollTop -= velocity * 16;
    // Rand erreicht: Nachschwung beenden.
    frame = el.scrollTop === before ? 0 : requestAnimationFrame(momentum);
  };

  const onPointerDown = (e: PointerEvent) => {
    stopMomentum();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (el.scrollHeight <= el.clientHeight) return;
    const target = e.target as Element | null;
    if (target?.closest(IGNORE_SELECTOR)) return;
    // Klick auf den Scrollbalken selbst nicht abfangen.
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left + el.clientWidth) return;

    pointerId = e.pointerId;
    startY = lastY = e.clientY;
    startScroll = el.scrollTop;
    lastTime = performance.now();
    velocity = 0;
    dragging = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (!(e.buttons & 1)) {
      finish(e);
      return;
    }
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      dragging = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Zeiger schon weg – Ziehen funktioniert auch ohne Capture.
      }
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
      window.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    el.scrollTop = startScroll - dy;

    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 0) {
      // Geglättete Geschwindigkeit in px/ms für den Nachschwung.
      velocity = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * velocity;
    }
    lastY = e.clientY;
    lastTime = now;
  };

  const suppressClick = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.style.cursor = '';
    el.style.userSelect = '';
    // Den Klick, den der Browser nach dem Loslassen auslöst, verschlucken.
    el.addEventListener('click', suppressClick, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', suppressClick, { capture: true }), 0);
    // Kein Nachschwung, wenn die Maus vor dem Loslassen stillstand.
    if (performance.now() - lastTime < 80 && e.type === 'pointerup') {
      frame = requestAnimationFrame(momentum);
    }
  };

  // Native Bild-/Link-Drags würden das Ziehen kapern.
  const onDragStart = (e: DragEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest('[draggable="true"]')) e.preventDefault();
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
  el.addEventListener('dragstart', onDragStart);
  el.addEventListener('wheel', stopMomentum, { passive: true });
  return () => {
    stopMomentum();
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', finish);
    el.removeEventListener('pointercancel', finish);
    el.removeEventListener('dragstart', onDragStart);
    el.removeEventListener('wheel', stopMomentum);
    el.removeEventListener('click', suppressClick, { capture: true });
    el.style.cursor = '';
    el.style.userSelect = '';
  };
}
