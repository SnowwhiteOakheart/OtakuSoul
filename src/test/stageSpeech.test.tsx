// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import {
  LINGER_MS,
  clearStageSpeech,
  scheduleSpeech,
  sentenceTimeline,
  splitSentences,
  useStageSpeech,
} from '../services/stageSpeech';
import { StageSpeakerBubble } from '../components/stage/StageSpeakerBubble';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, EmotionResult } from '../types';

const emotion = (vrm: string): EmotionResult => ({ emotion: vrm, vrm_expression: vrm, portrait: null }) as unknown as EmotionResult;

describe('sentences of the Stage voice', () => {
  it('splits a text into sentences and joins tiny ones', () => {
    expect(splitSentences('Hello there, traveller. Watch out!  The bridge…  is old')).toEqual([
      'Hello there, traveller.',
      'Watch out! The bridge…',
      'is old',
    ]);
    expect(splitSentences('Oh. You came back after all?')).toEqual(['Oh. You came back after all?']);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('shares the clip time by the length of the sentences', () => {
    const timeline = sentenceTimeline(['a'.repeat(30), 'b'.repeat(10)], 2, 6);
    expect(timeline.map((s) => [s.start, s.end])).toEqual([[2, 5], [5, 6]]);
  });
});

describe('scheduleSpeech', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetApiMocks();
    clearStageSpeech();
  });
  afterEach(() => vi.useRealTimers());

  it('shows each sentence when it plays, with its feeling, and goes after the last', async () => {
    vi.mocked(api.classifyTextEmotion).mockImplementation(async (text) => emotion(text.includes('!') ? 'surprised' : 'happy'));
    scheduleSpeech({ sender_name: 'Lirwen', sender_role: 'companion' }, 'Good morning to you. A dragon, right here!', 1, 3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(useStageSpeech.getState().line).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(useStageSpeech.getState().line).toMatchObject({ speaker: 'Lirwen', text: 'Good morning to you.', emotion: { vrm_expression: 'happy' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(useStageSpeech.getState().line).toMatchObject({ text: 'A dragon, right here!', emotion: { vrm_expression: 'surprised' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000 + LINGER_MS);
    });
    expect(useStageSpeech.getState().line).toBeNull();
  });

  it('a stop removes the bubble and what was planned', async () => {
    vi.mocked(api.classifyTextEmotion).mockResolvedValue(emotion('neutral'));
    scheduleSpeech({ sender_name: 'GM', sender_role: 'gm' }, 'The door opens slowly.', 0, 2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(useStageSpeech.getState().line?.text).toBe('The door opens slowly.');
    clearStageSpeech();
    expect(useStageSpeech.getState().line).toBeNull();
    scheduleSpeech({ sender_name: 'GM', sender_role: 'gm' }, 'Later one.', 5, 6);
    clearStageSpeech();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(useStageSpeech.getState().line).toBeNull();
  });
});

describe('StageSpeakerBubble', () => {
  const lirwen = {
    id: 'lirwen',
    card: { data: { name: 'Lirwen', extensions: { expressions: { happy: 'data:image/png;base64,HAPPY', neutral: 'data:image/png;base64,NEUTRAL' } } } },
    avatar_data_url: 'data:image/png;base64,AVATAR',
    source_path: null,
  } as unknown as CharacterProfile;

  beforeEach(() => {
    useAppStore.setState({ appLanguage: 'en', availableCharacters: [lirwen] });
    useStageSpeech.setState({ line: null });
  });

  it('is hidden while nobody speaks', () => {
    render(<StageSpeakerBubble />);
    expect(screen.queryByTestId('stage-speaker')).toBeNull();
  });

  it('shows the companion with the portrait of the sentence\'s feeling', () => {
    useStageSpeech.setState({ line: { id: 1, speaker: 'Lirwen', role: 'companion', text: '*smiles* So *nice* to see you!', emotion: emotion('happy') } });
    render(<StageSpeakerBubble />);
    expect(screen.getByRole('status')).toHaveTextContent('smiles So nice to see you!');
    expect(screen.getByRole('img', { name: 'Lirwen' })).toHaveAttribute('src', 'data:image/png;base64,HAPPY');
    expect(screen.getByTestId('stage-speaker').querySelector('[data-expression]')).toHaveAttribute('data-expression', 'happy');
  });

  it('the game master gets the book instead of a portrait', () => {
    useStageSpeech.setState({ line: { id: 2, speaker: 'Game Master', role: 'gm', text: 'Night falls.', emotion: null } });
    render(<StageSpeakerBubble />);
    expect(screen.getByText('Game Master')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Night falls.');
  });
});
