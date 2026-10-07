// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../store/useAppStore';
import { AvatarCanvas } from '../components/avatar/AvatarCanvas';
import type { CharacterProfile } from '../types';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost${path.startsWith('/') ? '' : '/'}${path}`,
}));

const charA: CharacterProfile = {
  id: 'chlammy_zell',
  source_path: '/presets/no-game-no-life/chlammy_zell.json',
  avatar_data_url: 'data:image/png;base64,CHLAMMY_AVATAR',
  bound_lorebooks: [],
  card: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Chlammy Zell',
      description: 'Strategist',
      personality: 'Cool',
      scenario: '',
      first_mes: 'Hello',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '1.0',
      alternate_greetings: [],
      extensions: {
        expressions: {
          neutral: 'expressions/chlammy_zell/neutral.webp',
        },
      },
    },
  },
};

const charB: CharacterProfile = {
  id: 'sakura_succubus',
  source_path: '/presets/sakura/sakura.png',
  avatar_data_url: 'data:image/png;base64,SAKURA_AVATAR',
  bound_lorebooks: [],
  card: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Sakura',
      description: 'Succubus',
      personality: 'Playful',
      scenario: '',
      first_mes: 'Hi',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '1.0',
      alternate_greetings: [],
      extensions: {},
    },
  },
};

describe('AvatarCanvas portrait mode', () => {
  beforeEach(() => {
    useAppStore.setState({
      avatarMode: '2d',
      currentEmotion: {
        emotion: 'neutral',
        vrm_expression: 'neutral',
        live2d_expression: 'neutral_animation',
        confidence: 1.0,
        intensity: 0.8,
      },
    });
  });

  it('renders character without expressions using avatar_data_url directly', () => {
    render(<AvatarCanvas character={charB} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,SAKURA_AVATAR');
    expect(img).toHaveAttribute('alt', 'Sakura');
  });

  it('renders character with expressions using resolved expression path', () => {
    render(<AvatarCanvas character={charA} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      'asset://localhost/presets/no-game-no-life/expressions/chlammy_zell/neutral.webp'
    );
    expect(img).toHaveAttribute('alt', 'Chlammy Zell');
  });

  it('falls back to avatar_data_url on img error event', async () => {
    render(<AvatarCanvas character={charA} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      'asset://localhost/presets/no-game-no-life/expressions/chlammy_zell/neutral.webp'
    );

    // Simulate image loading failure
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,CHLAMMY_AVATAR');
    });
  });

  it('switches portrait immediately when character prop changes without keeping previous character', () => {
    const { rerender } = render(<AvatarCanvas character={charB} />);
    let img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,SAKURA_AVATAR');

    // Switch to Char A
    rerender(<AvatarCanvas character={charA} />);
    img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      'asset://localhost/presets/no-game-no-life/expressions/chlammy_zell/neutral.webp'
    );
    expect(img).toHaveAttribute('alt', 'Chlammy Zell');
  });
});
