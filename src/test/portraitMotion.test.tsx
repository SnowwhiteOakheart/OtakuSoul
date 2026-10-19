// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
const frames = vi.hoisted(() => ({ callback: null as null | ((amplitude: number) => void) }));
vi.mock('../services/audioPlayer', () => ({
  audioPlayer: { onAudioFrame: (cb: (amplitude: number) => void) => { frames.callback = cb; return () => { frames.callback = null; }; } },
}));
import { MorphingPortrait } from '../components/avatar/AvatarCanvas';
import { useAppStore } from '../store/useAppStore';
import { breathSeconds, PORTRAIT_SPEAKING_FPS, portraitPose, readPortraitMotion } from '../utils/portraitMotion';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ portraitMotion: true });
});

describe('living portrait', () => {
  it('breathes faster when tense and calmer when at ease', () => {
    const neutral = breathSeconds({ emotion: 'neutral', vrm_expression: 'relaxed' });
    expect(breathSeconds({ emotion: 'fear', vrm_expression: 'sad', portrait: 'fear' })).toBeLessThan(neutral);
    expect(breathSeconds({ emotion: 'desire', vrm_expression: 'relaxed', portrait: 'aroused' })).toBeLessThan(neutral);
    expect(breathSeconds({ emotion: 'relief', vrm_expression: 'happy', portrait: 'afterglow' })).toBeGreaterThan(neutral);
  });

  it('moves with the voice while speaking and keeps still when switched off', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<MorphingPortrait src="data:a" alt="Ayu" isSpeaking breath={3} />);
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.dataset.alive).toBe('true');
      expect(frame.dataset.breath).toBe('3');
      const sway = container.querySelector('.portrait-alive') as HTMLElement;
      const speech = container.querySelector('.portrait-speech') as HTMLElement;
      const swayed = sway.style.transform;
      expect(swayed).toContain('rotate(');
      act(() => frames.callback?.(1));
      act(() => vi.advanceTimersByTime(1000 / PORTRAIT_SPEAKING_FPS));
      expect(speech.style.transform).toMatch(/translateY\(-0\.[1-9]/);
      rerender(<MorphingPortrait src="data:a" alt="Ayu" isSpeaking={false} breath={3} />);
      act(() => vi.advanceTimersByTime(1000));
      expect(speech.style.transform).toContain('translateY(0.000%)');
      expect(sway.style.transform).not.toBe(swayed);

      act(() => useAppStore.getState().setPortraitMotion(false));
      expect(frame.dataset.alive).toBeUndefined();
      expect(container.querySelector('.portrait-alive')).toBeNull();
      expect(sway.style.transform).toBe('');
      expect(readPortraitMotion()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves only a fraction of the picture', () => {
    const pose = portraitPose(1.3, 4.2, 0.5, 1);
    expect(pose.breath).toMatch(/^scale\(1\.00\d+, 1\.01?\d+\)/);
    expect(pose.speech).toBe('translateY(-1.400%) scale(1.0180)');
  });
});
