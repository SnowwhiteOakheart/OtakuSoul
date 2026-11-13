import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';

const STORAGE_KEY = 'otakusoul.chat.avatarWidth';
const MIN = 20;
const MAX = 60;
const STEP = 2;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

const read = (): number | null => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored ? clamp(stored) : null;
  } catch {
    return null;
  }
};

const store = (value: number | null) => {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value.toFixed(1));
  } catch (error) {
    console.warn('Avatar-Breite konnte nicht gespeichert werden:', error);
  }
};

/**
 * Width of the chat avatar panel in percent of the split area, kept per device.
 * `null` means the default responsive width.
 */
export const useAvatarWidth = (): [number | null, (value: number | null, persist?: boolean) => void] => {
  const [width, setWidth] = useState<number | null>(read);
  const update = useCallback((value: number | null, persist = true) => {
    const next = value === null ? null : clamp(value);
    setWidth(next);
    if (persist) store(next);
  }, []);
  return [width, update];
};

interface Props {
  /** The flex container holding avatar and chat side by side. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the avatar sits right of the chat (dragging then works mirrored). */
  avatarRight: boolean;
  width: number | null;
  onChange: (value: number | null, persist?: boolean) => void;
}

/** Drag handle between avatar and chat; double click returns to the default width. */
export const AvatarResizeHandle: React.FC<Props> = ({ containerRef, avatarRight, width, onChange }) => {
  const { t } = useTranslation();
  const dragging = useRef(false);
  const latest = useRef<number | null>(width);
  const [active, setActive] = useState(false);

  const percentAt = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const offset = avatarRight ? rect.right - clientX : clientX - rect.left;
    return clamp((offset / rect.width) * 100);
  };

  // Current width in percent, also when the default (CSS) width is still active.
  const currentPercent = () => {
    if (width !== null) return width;
    const container = containerRef.current;
    const panel = container?.querySelector<HTMLElement>('[data-avatar-panel]');
    if (!container || !panel || container.clientWidth === 0) return 33;
    return clamp((panel.offsetWidth / container.clientWidth) * 100);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    setActive(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = percentAt(event.clientX);
    if (next === null) return;
    latest.current = next;
    // Only remember the width once the drag ends.
    onChange(next, false);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (latest.current !== null) onChange(latest.current);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = avatarRight ? 'ArrowLeft' : 'ArrowRight';
    const shrink = avatarRight ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === grow || event.key === shrink) {
      event.preventDefault();
      onChange(currentPercent() + (event.key === grow ? STEP : -STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(MAX);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('chat.avatarResize')}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width === null ? undefined : Math.round(width)}
      tabIndex={0}
      title={t('chat.avatarResizeHint')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(null)}
      onKeyDown={onKeyDown}
      className="group hidden md:flex relative z-10 w-1.5 -mx-0.5 shrink-0 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={`h-full w-px transition-colors ${
          active ? 'bg-accent-400' : 'bg-slate-800 group-hover:bg-accent-500/70 group-focus-visible:bg-accent-400'
        }`}
      />
      <span
        aria-hidden
        className={`absolute h-10 w-1 rounded-full transition-colors ${
          active ? 'bg-accent-400' : 'bg-slate-600 group-hover:bg-accent-400 group-focus-visible:bg-accent-400'
        }`}
      />
    </div>
  );
};
