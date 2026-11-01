import { useEffect, useState, useRef } from 'react';

export function useGridCols(breakpoints: { [key: number]: number }, defaultCols = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(defaultCols);
  const attached = useRef<{ element: HTMLDivElement; config: string; observer: ResizeObserver } | null>(null);
  const config = JSON.stringify([defaultCols, breakpoints]);

  // The grid can appear after loading. Keep observing it across scroll renders, including
  // callers that pass a fresh but equivalent breakpoint object on every render.
  useEffect(() => {
    const element = ref.current;
    if (attached.current?.element === element && attached.current.config === config) return;
    attached.current?.observer.disconnect();
    attached.current = null;
    if (!element) return;
    const sortedBreakpoints = Object.keys(breakpoints).map(Number).sort((a, b) => a - b);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let matchedCols = defaultCols;
        for (const bp of sortedBreakpoints) {
          if (entry.contentRect.width >= bp) matchedCols = breakpoints[bp] ?? defaultCols;
        }
        setCols(matchedCols);
      }
    });
    observer.observe(element);
    attached.current = { element, config, observer };
  });

  useEffect(() => () => {
    attached.current?.observer.disconnect();
    attached.current = null;
  }, []);

  return { ref, cols };
}
