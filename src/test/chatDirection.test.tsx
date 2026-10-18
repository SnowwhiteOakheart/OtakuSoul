// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/voice/VoiceCallControls', () => ({ VoiceCallControls: () => null }));
import { useAppStore } from '../store/useAppStore';
import { ChatComposer, asDirection } from '../components/chat/ChatComposer';
import { RoleplayMessage, splitDirections } from '../components/chat/RoleplayMessage';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeChatId: 'chat-1' }, true);
});
afterEach(() => vi.restoreAllMocks());

describe('directions to the AI ((…))', () => {
  it('splits directions off the story text', () => {
    expect(splitDirections('*nickt* ((spannender)) "Los!"')).toEqual([
      { direction: false, text: '*nickt* ' },
      { direction: true, text: 'spannender' },
      { direction: false, text: ' "Los!"' },
    ]);
    // Unclosed (still streaming) stays story text.
    expect(splitDirections('Hallo ((noch offen')).toEqual([{ direction: false, text: 'Hallo ((noch offen' }]);
    expect(asDirection('  Lass es regnen ')).toBe('((Lass es regnen))');
    expect(asDirection('((schon da))')).toBe('((schon da))');
  });

  it('shows a direction as a marked note without the parentheses', () => {
    const { container } = render(<RoleplayMessage content={'*geht* ((mach es düster)) "Komm."'} isUser />);
    const note = container.querySelector('[data-ooc]');
    expect(note?.textContent).toBe('Direction: mach es düster');
    expect(container.textContent).not.toContain('((');
  });

  it('sends the next message as a direction and switches back afterwards', async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ sendMessage });
    render(<ChatComposer />);
    const toggle = screen.getByRole('button', { name: 'Direction' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('Direction for the AI'));
    await user.type(screen.getByRole('textbox'), 'Lass es regnen{Enter}');
    expect(sendMessage).toHaveBeenCalledWith('((Lass es regnen))', []);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
