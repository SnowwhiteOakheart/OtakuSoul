// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { isRepeat } from '../utils/repetition';
import { useAppStore } from '../store/useAppStore';
import { SamplerSettings } from '../components/settings/sections/SamplerSettings';
import { resetApiMocks } from './mockApi';

const reply = '*lächelt* "Lass uns morgen zum Schrein gehen. Dort gibt es tausend rote Tore und einen schönen Blick über die Stadt."';
const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', saveCurrentSettings: vi.fn() }, true);
});

describe('repeated replies', () => {
  it('spots a near copy of a recent reply, not short or different ones', () => {
    expect(isRepeat(reply, ['Hallo!', reply])).toBe(true);
    expect(isRepeat(reply.replace('schönen', 'herrlichen'), [reply])).toBe(true);
    expect(isRepeat('*nickt* "Gern, aber erst nach dem Frühstück. Ich kenne dort ein kleines Café mit Blick auf den Fluss."', [reply])).toBe(false);
    expect(isRepeat('Ja.', ['Ja.'])).toBe(false);
    // Only the last few replies count.
    expect(isRepeat(reply, [reply, 'a b c d e f g h i j k l m', 'n o p q r s t u v w x y z', 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf'])).toBe(false);
  });

  it('switches variety on and off and the automatic rewrite separately', async () => {
    const user = userEvent.setup();
    render(<SamplerSettings />);
    const variety = screen.getByRole('switch', { name: /Write with more variety/ });
    expect(variety).toHaveAttribute('aria-checked', 'false');
    await user.click(variety);
    expect(useAppStore.getState().sampling).toMatchObject({ dry_multiplier: 0.8, xtc_threshold: 0.1, presence_penalty: 0.3 });
    expect(variety).toHaveAttribute('aria-checked', 'true');
    await user.click(variety);
    expect(useAppStore.getState().sampling.dry_multiplier).toBeUndefined();
    expect(useAppStore.getState().sampling.temperature).toBe(initial.sampling.temperature);

    const reroll = screen.getByRole('switch', { name: /Rewrite repeated replies/ });
    expect(reroll).toHaveAttribute('aria-checked', 'true');
    await user.click(reroll);
    expect(useAppStore.getState().rerollRepeats).toBe(false);
  });
});
