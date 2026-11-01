// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useGridCols } from '../hooks/useGridCols';

afterEach(() => vi.unstubAllGlobals());

it('observes a grid appearing after loading without restarting on scroll renders', () => {
  let resize: ResizeObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const observer = { observe, disconnect };
  const create = vi.fn(function (callback: ResizeObserverCallback) { resize = callback; return observer; });
  vi.stubGlobal('ResizeObserver', create);
  const Grid = ({ loaded }: { loaded: boolean }) => {
    const { ref, cols } = useGridCols({ 640: 3, 768: 4 }, 2);
    return loaded ? <div ref={ref} data-testid="grid">{cols}</div> : null;
  };
  const view = render(<Grid loaded={false} />);
  expect(create).not.toHaveBeenCalled();
  view.rerender(<Grid loaded />);
  expect(observe).toHaveBeenCalledWith(screen.getByTestId('grid'));
  act(() => resize([{ contentRect: { width: 800 } }] as ResizeObserverEntry[], observer as unknown as ResizeObserver));
  expect(screen.getByTestId('grid')).toHaveTextContent('4');
  view.rerender(<Grid loaded />);
  expect(create).toHaveBeenCalledTimes(1);
  act(() => resize([{ contentRect: { width: 650 } }] as ResizeObserverEntry[], observer as unknown as ResizeObserver));
  expect(screen.getByTestId('grid')).toHaveTextContent('3');
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});
