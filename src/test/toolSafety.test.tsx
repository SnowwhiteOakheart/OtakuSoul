// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
import { useAppStore } from '../store/useAppStore';
import { SafetyCountdownBanner } from '../components/companion/SafetyCountdownBanner';
import { toolEffects } from '../components/companion/toolEffects';
import { resetApiMocks } from './mockApi';
import type { CompanionState, ToolCallRequest } from '../types';

const initial = useAppStore.getState();
const call = (tool_name: string, args: object): ToolCallRequest =>
  ({ id: 'c1', tool_name, arguments: args, requires_confirmation: true, status: 'pending', created_at: 0 }) as ToolCallRequest;
const show = (pending: ToolCallRequest) => {
  useAppStore.setState({
    companionState: { pending_tool_calls: [pending], settings: { countdown_seconds: 25 } } as unknown as CompanionState,
  });
  render(<SafetyCountdownBanner />);
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en' }, true);
});

describe('tool approval', () => {
  it('names what a tool may do', () => {
    expect(toolEffects('execute_code', {})).toEqual(['runsCode', 'writesFiles', 'network']);
    expect(toolEffects('file_organizer', { action: ' LIST ' })).toEqual(['readsFiles']);
    expect(toolEffects('file_organizer', { action: 'organize' })).toEqual(['readsFiles', 'writesFiles']);
    expect(toolEffects('filesystem__write_file', {})).toEqual(['external']);
    expect(toolEffects('set_timer', {})).toEqual([]);
  });

  it('shows the full script as it will run, with its effects', () => {
    show(call('execute_code', { language: 'bash', code: 'echo "eins"\nrm -rf ~/tmp/x' }));
    const script = screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent === 'echo "eins"\nrm -rf ~/tmp/x');
    expect(script).toBeInTheDocument();
    expect(screen.getByText('Language: bash')).toBeInTheDocument();
    const effects = screen.getByRole('list', { name: 'What this tool may do' });
    expect(effects).toHaveTextContent('runs code with your rights');
    expect(effects).toHaveTextContent('changes files');
  });

  it('marks unknown external tools', () => {
    show(call('filesystem__delete_file', { path: 'x' }));
    expect(screen.getByRole('list', { name: 'What this tool may do' })).toHaveTextContent('external tool – effects unknown');
  });
});
