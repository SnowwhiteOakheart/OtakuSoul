import React, { useLayoutEffect, useRef, useState } from 'react';

interface ScrollTextProps {
  children: React.ReactNode;
  /** Visible lines before the text scrolls. */
  lines?: number;
  /** Text styles; the height follows their line height. */
  className?: string;
  /** Names the region for screen readers once it scrolls. */
  label?: string;
}

/**
 * Long free text (personality, traits) shown with at most `lines` lines; the rest scrolls inside,
 * so a long card doesn't push everything else away. Keyboard-focusable only when it overflows.
 */
export const ScrollText: React.FC<ScrollTextProps> = ({ children, lines = 3, className = '', label }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  // Cut exactly at the start of line `lines + 1`: WebKit may lay lines out tighter than the
  // computed line height, and `3lh` then shows a strip of the fourth line.
  const [maxHeight, setMaxHeight] = useState<string>(`${lines}lh`);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      // Without layout (jsdom) there are no line boxes; `lh` then stays.
      const rects = typeof range.getClientRects === 'function' ? [...range.getClientRects()] : [];
      const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      const cut = tops[lines] !== undefined ? tops[lines]! - tops[0]! : undefined;
      if (cut) setMaxHeight(`${cut}px`);
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, lines]);

  return (
    <p
      ref={ref}
      style={{ maxHeight }}
      className={`overflow-y-auto overscroll-contain whitespace-pre-wrap break-words ${className}`}
      tabIndex={overflows ? 0 : undefined}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? label : undefined}
    >
      {children}
    </p>
  );
};
