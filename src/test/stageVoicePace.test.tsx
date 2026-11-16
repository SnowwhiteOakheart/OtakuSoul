// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../services/characterVoice', () => ({
  loadCharacterVoiceConfig: vi.fn(async () => ({ engine: 'edge', volume: 1, output_device_id: '', effects: null })),
}));
vi.mock('../services/narratorVoice', () => ({
  STAGE_NARRATOR_VOICE_ID: 'stage_narrator',
  voiceParts: vi.fn(async (text: string, voice: unknown) => [{ text, voice }]),
}));
vi.mock('../services/audioPlayer', () => ({
  audioPlayer: { enqueue: vi.fn(), stop: vi.fn(), now: () => 0 },
  gainFromVoiceVolume: () => 1,
}));

import { api } from '../services/api';
import { audioPlayer } from '../services/audioPlayer';
import { silenceStageMessages, speakStageMessages, speechChunks, stopStageVoice } from '../services/stageVoice';
import { scheduleSpeech, useStageSpeech } from '../services/stageSpeech';
import { useStageTextPace } from '../services/stageTextPace';
import { PacedStageText } from '../components/stage/StageText';
import { resetApiMocks } from './mockApi';

const msg = (id: string, content: string) => ({ id, sender_name: 'Game Master', sender_role: 'gm', content });

describe('Stage voice', () => {
  beforeEach(() => {
    resetApiMocks();
    vi.mocked(api.synthesizeSpeech).mockImplementation(async (text) => `clip:${text}`);
    vi.mocked(audioPlayer.enqueue).mockClear();
    stopStageVoice();
  });

  it('cuts a long text into whole sentences, the first piece short', () => {
    const text = Array(8).fill('Der Wind heult durch die alten Gänge der Burg.').join(' ');
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBeLessThanOrEqual(120);
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every((c) => c.endsWith('.'))).toBe(true);
  });

  it('reads each message once, in order, also across calls', async () => {
    void speakStageMessages([msg('a', 'Erstens kommt das.')], []);
    await speakStageMessages([msg('a', 'Erstens kommt das.'), msg('b', 'Zweitens kommt dies.')], []);
    expect(vi.mocked(audioPlayer.enqueue).mock.calls.map((c) => c[0])).toEqual(['clip:Erstens kommt das.', 'clip:Zweitens kommt dies.']);
  });

  it('reads nothing of a stopped turn, and everything again after a stop', async () => {
    silenceStageMessages(['a']);
    await speakStageMessages([msg('a', 'Weg damit, sofort.')], []);
    expect(audioPlayer.enqueue).not.toHaveBeenCalled();
    await speakStageMessages([msg('a', 'Noch einmal von vorn.')], [], true);
    expect(audioPlayer.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('speaker bubble switch', () => {
  afterEach(() => useStageSpeech.getState().setEnabled(true));

  it('schedules nothing, not even the feeling, when switched off', () => {
    resetApiMocks();
    useStageSpeech.getState().setEnabled(false);
    scheduleSpeech({ sender_name: 'Lirwen', sender_role: 'companion' }, 'Hallo du da.', 0, 1);
    expect(api.classifyTextEmotion).not.toHaveBeenCalled();
    expect(localStorage.getItem('otakusoul.stageSpeakerBubble')).toBe('false');
  });
});

describe('text pace', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }));
  afterEach(() => {
    vi.useRealTimers();
    useStageTextPace.getState().setPace('read');
  });

  it('reveals live text at the pace and keeps going in the finished log line', async () => {
    useStageTextPace.getState().setPace('read');
    const text = 'a'.repeat(50);
    const { container, rerender } = render(<PacedStageText id="m1" text={text} live />);
    expect(container.textContent).toBe('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const shown = container.textContent!.length;
    expect(shown).toBeGreaterThan(15);
    expect(shown).toBeLessThan(35);
    // The turn ended: the same message from the log continues where the live text was.
    rerender(<PacedStageText id="m1" text={text} />);
    expect(container.textContent!.length).toBeGreaterThanOrEqual(shown);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.textContent).toBe(text);
  });

  it('shows older messages and everything with "instant" at once', () => {
    useStageTextPace.getState().setPace('read');
    render(<PacedStageText id="old" text="Schon lange da." />);
    expect(screen.getByText('Schon lange da.')).toBeTruthy();
    useStageTextPace.getState().setPace('instant');
    render(<PacedStageText id="m9" text="Sofort da." live />);
    expect(screen.getByText('Sofort da.')).toBeTruthy();
  });
});
