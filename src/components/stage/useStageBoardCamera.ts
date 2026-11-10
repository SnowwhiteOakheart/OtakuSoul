import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { GridPos } from '../../types';

interface Drag {
  pointer: number;
  start: GridPos;
  center: GridPos;
  scale: number;
  moved: boolean;
}

export function useStageBoardCamera(bounds: GridPos & { width: number; height: number }) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<GridPos | null>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);
  const point = center ?? bounds;
  const width = bounds.width / zoom;
  const height = bounds.height / zoom;

  return {
    zoom,
    viewBox: `${point.x - width / 2} ${point.y - height / 2} ${width} ${height}`,
    zoomBy(factor: number) {
      setCenter(point);
      setZoom((value) => Math.min(4, Math.max(.75, value * factor)));
    },
    focus(target: GridPos) {
      setCenter(target);
      setZoom((value) => Math.max(value, 1.4));
    },
    reset() {
      setCenter(null);
      setZoom(1);
    },
    pointerEvents: {
      onPointerDown(event: PointerEvent<SVGSVGElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        const scale = event.currentTarget.getScreenCTM()?.a;
        if (!scale) return;
        skipClick.current = false;
        drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, center: point, scale, moved: false };
      },
      onPointerMove(event: PointerEvent<SVGSVGElement>) {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        const x = event.clientX - current.start.x;
        const y = event.clientY - current.start.y;
        if (!current.moved && Math.hypot(x, y) < 6) return;
        if (!current.moved) {
          event.currentTarget.setPointerCapture(event.pointerId);
          current.moved = true;
          skipClick.current = true;
        }
        setCenter({ x: current.center.x - x / current.scale, y: current.center.y - y / current.scale });
      },
      onPointerUp(event: PointerEvent<SVGSVGElement>) {
        if (drag.current?.pointer === event.pointerId) drag.current = null;
      },
      onPointerCancel(event: PointerEvent<SVGSVGElement>) {
        if (drag.current?.pointer === event.pointerId) drag.current = null;
      },
      onPointerLeave() {
        if (!drag.current?.moved) drag.current = null;
      },
      onLostPointerCapture() {
        drag.current = null;
      },
      onClickCapture(event: MouseEvent<SVGSVGElement>) {
        if (!skipClick.current || event.detail === 0) return;
        skipClick.current = false;
        event.stopPropagation();
      },
    },
  };
}
