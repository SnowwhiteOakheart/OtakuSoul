// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isTap, TAP_MAX_MOVE_PX, TAP_MAX_MS, watchTaps, zoneInViewer } from '../components/avatar/avatarTouch';
import { TOUCH_COOLDOWN_MS, TOUCH_MOOD_MS, useFigureTouch } from '../components/avatar/FigureTouchReaction';
import { HEAD_ZONE_END } from '../components/companion/petBehavior';
import { useAppStore } from '../store/useAppStore';

describe('tap detection', () => {
  it('counts a short press that barely moved as a tap, a drag or a hold as none', () => {
    const down = { x: 100, y: 100, t: 0 };
    expect(isTap(down, { x: 103, y: 102, t: 200 })).toBe(true);
    expect(isTap(down, { x: 100 + TAP_MAX_MOVE_PX + 1, y: 100, t: 200 })).toBe(false);
    expect(isTap(down, { x: 100, y: 100, t: TAP_MAX_MS + 1 })).toBe(false);
  });

  it('reports the taps of the main button on an element and nothing else', () => {
    const element = document.createElement('div');
    const taps: Array<[number, number]> = [];
    const stop = watchTaps(element, (x, y) => taps.push([x, y]));
    const press = (type: string, init: PointerEventInit) =>
      element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }));

    press('pointerdown', { button: 0, clientX: 10, clientY: 20 });
    press('pointerup', { button: 0, clientX: 11, clientY: 21 });
    // A drag (the camera turns), a right click and a cancelled press are no taps.
    press('pointerdown', { button: 0, clientX: 10, clientY: 20 });
    press('pointerup', { button: 0, clientX: 60, clientY: 80 });
    press('pointerdown', { button: 2, clientX: 10, clientY: 20 });
    press('pointerup', { button: 2, clientX: 10, clientY: 20 });
    press('pointerdown', { button: 0, clientX: 10, clientY: 20 });
    press('pointercancel', {});
    press('pointerup', { button: 0, clientX: 10, clientY: 20 });
    expect(taps).toEqual([[11, 21]]);

    stop();
    press('pointerdown', { button: 0, clientX: 1, clientY: 1 });
    press('pointerup', { button: 0, clientX: 1, clientY: 1 });
    expect(taps).toHaveLength(1);
  });

  it('calls the upper part of the viewer the head, by the figure\'s own head line when known', () => {
    expect(zoneInViewer(50, 1000, 0.3)).toBe('head');
    expect(zoneInViewer(400, 1000, 0.3)).toBe('body');
    expect(zoneInViewer(HEAD_ZONE_END * 1000 - 1, 1000, null)).toBe('head');
    expect(zoneInViewer(HEAD_ZONE_END * 1000 + 1, 1000, null)).toBe('body');
  });
});

describe('what a touch does in the chat', () => {
  const applyHormoneInteraction = vi.fn().mockResolvedValue(undefined);
  const setCurrentEmotion = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    applyHormoneInteraction.mockClear();
    setCurrentEmotion.mockClear();
    useAppStore.setState({ applyHormoneInteraction, setCurrentEmotion });
  });
  afterEach(() => vi.useRealTimers());

  it('pats on the head, pokes elsewhere, and the figure gets its own mood back', () => {
    const before = useAppStore.getState().currentEmotion;
    const { result } = renderHook(() => useFigureTouch());

    act(() => result.current.onTouch({ zone: 'head', x: 5, y: 6 }));
    expect(applyHormoneInteraction).toHaveBeenCalledWith('headpat');
    expect(setCurrentEmotion.mock.calls[0]![0]).toMatchObject({ emotion: 'embarrassment' });
    expect(result.current.flash).toMatchObject({ zone: 'head', x: 5, y: 6 });

    // Back to the earlier mood once the moment has passed (nothing else changed it).
    useAppStore.setState({ currentEmotion: setCurrentEmotion.mock.calls[0]![0] });
    act(() => {
      vi.advanceTimersByTime(TOUCH_MOOD_MS + 1);
    });
    expect(setCurrentEmotion).toHaveBeenLastCalledWith(before);

    act(() => {
      vi.advanceTimersByTime(TOUCH_COOLDOWN_MS);
    });
    act(() => result.current.onTouch({ zone: 'body', x: 1, y: 1 }));
    expect(applyHormoneInteraction).toHaveBeenLastCalledWith('poke');
    expect(setCurrentEmotion.mock.calls.at(-1)![0]).toMatchObject({ emotion: 'surprise' });
  });

  it('shows the sign for every touch but changes hormones and mood only once per cooldown', () => {
    const { result } = renderHook(() => useFigureTouch());
    act(() => result.current.onTouch({ zone: 'head', x: 1, y: 1 }));
    act(() => result.current.onTouch({ zone: 'head', x: 2, y: 2 }));
    expect(applyHormoneInteraction).toHaveBeenCalledTimes(1);
    expect(result.current.flash).toMatchObject({ x: 2, y: 2 });
  });

  it('leaves a mood that changed meanwhile (a new reply) alone', () => {
    const { result } = renderHook(() => useFigureTouch());
    act(() => result.current.onTouch({ zone: 'head', x: 1, y: 1 }));
    const calls = setCurrentEmotion.mock.calls.length;
    useAppStore.setState({ currentEmotion: { ...useAppStore.getState().currentEmotion, emotion: 'joy' } });
    act(() => {
      vi.advanceTimersByTime(TOUCH_MOOD_MS + 1);
    });
    expect(setCurrentEmotion.mock.calls.length).toBe(calls);
  });
});
