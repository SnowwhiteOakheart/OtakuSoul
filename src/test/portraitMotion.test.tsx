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
import { breathSeconds, readPortraitMotion } from '../utils/portraitMotion';

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
    const { container, rerender } = render(<MorphingPortrait src="data:a" alt="Ayu" isSpeaking breath={3} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.dataset.alive).toBe('true');
    expect(frame.dataset.breath).toBe('3');
    act(() => frames.callback?.(1));
    const speech = container.querySelector('.portrait-speech') as HTMLElement;
    expect(Number(speech.style.getPropertyValue('--speech'))).toBeGreaterThan(0);
    rerender(<MorphingPortrait src="data:a" alt="Ayu" isSpeaking={false} breath={3} />);
    expect(speech.style.getPropertyValue('--speech')).toBe('0');

    act(() => useAppStore.getState().setPortraitMotion(false));
    expect(frame.dataset.alive).toBeUndefined();
    expect(container.querySelector('.portrait-alive')).toBeNull();
    expect(readPortraitMotion()).toBe(false);
  });
});
