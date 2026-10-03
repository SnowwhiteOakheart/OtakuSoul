import { useEffect, useState, useRef } from 'react';

export function useGridCols(breakpoints: { [key: number]: number }, defaultCols = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(defaultCols);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        let matchedCols = defaultCols;
        const sortedBreakpoints = Object.keys(breakpoints)
          .map(Number)
          .sort((a, b) => a - b);
        
        for (const bp of sortedBreakpoints) {
          if (width >= bp) {
            matchedCols = breakpoints[bp] ?? defaultCols;
          }
        }
        setCols(matchedCols);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [breakpoints, defaultCols]);

  return { ref, cols };
}
