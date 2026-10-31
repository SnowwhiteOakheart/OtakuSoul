import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How far a virtualized grid starts below the top of its scroll panel (content above pushes it
 * down; the virtualizer counts from the grid's top). Measured again whenever the grid or anything
 * above it inside the panel changes size; `layoutKey` changes when content above appears or goes.
 */
export function useScrollMargin(
  panel: RefObject<HTMLElement | null> | string,
  gridRef: RefObject<HTMLElement | null>,
  layoutKey: string,
): number {
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const panelEl = typeof panel === 'string' ? document.getElementById(panel) : panel.current;
    const grid = gridRef.current;
    if (!panelEl || !grid) return undefined;
    // A ResizeObserver reports every observed element once right away, so this also measures first.
    const observer = new ResizeObserver(() => {
      const next = grid.getBoundingClientRect().top - panelEl.getBoundingClientRect().top + panelEl.scrollTop;
      setMargin((current) => (Math.abs(current - next) > 1 ? next : current));
    });
    observer.observe(grid);
    for (let node: Element | null = grid; node && node !== panelEl; node = node.parentElement) {
      for (let above = node.previousElementSibling; above; above = above.previousElementSibling) observer.observe(above);
    }
    return () => observer.disconnect();
  }, [panel, gridRef, layoutKey]);
  return margin;
}
