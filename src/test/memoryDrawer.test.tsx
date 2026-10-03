// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { CognitiveMemoryDrawer } from '../components/chat/CognitiveMemoryDrawer';
import { toast } from '../components/ui/feedback';
import { translate } from '../i18n';
import { resetApiMocks } from './mockApi';
import type { CharacterProfile, CognitiveOverview } from '../types';

const initialState = useAppStore.getState();

const overview: CognitiveOverview = {
  psychology: {
    primary_emotion: 'joy',
    intensity: 3,
    psychological_tension: 'Neugier',
    emotional_decay_counter: 0,
    active_agenda: 'Den Nutzer kennenlernen',
    immediate_focus: 'Gespräch',
    core_identity: ['Loyal'],
    updated_at: 0,
  },
  relationship: {
    user_name: 'Snow',
    trust_level: 'Hoch',
    unspoken_tension: 'Keine',
    preferences_habits: ['Tee'],
    shared_milestones: ['Erstes Treffen'],
    updated_at: 0,
  },
  recent_memories: [],
  recent_diary: [],
  healing_logs: [],
};

beforeEach(() => {
  resetApiMocks();
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState(initialState, true);
  useAppStore.setState({
    appLanguage: 'en',
    activeCharacter: { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile,
    cognitiveOverview: overview,
    characterMarkdown: '# Ayu',
    userMarkdown: '# Snow',
  });
  // Opening the drawer refreshes everything; keep the prepared state.
  vi.mocked(api.getCognitiveOverview).mockResolvedValue(overview);
  vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Ayu');
  vi.mocked(api.getUserMemoryMarkdown).mockResolvedValue('# Snow');
  vi.mocked(api.listMemoryBackups).mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe('CognitiveMemoryDrawer', () => {
  it('mounts outside its filtered HUD parent so the drawer can cover the viewport', () => {
    const { container } = render(
      <div style={{ backdropFilter: 'blur(8px)' }}>
        <CognitiveMemoryDrawer isOpen onClose={() => {}} />
      </div>
    );
    const drawer = screen.getByRole('dialog');
    expect(drawer.parentElement).toBe(document.body);
    expect(container).not.toContainElement(drawer);
  });

  it('renders every tab without crashing', async () => {
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    for (const tab of tabs) {
      await user.click(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByText(/View crashed/)).not.toBeInTheDocument();
    }
  });

  it('keeps unsaved markdown edits per file and saves the edited one', async () => {
    const user = userEvent.setup();
    const saveCharacterMarkdown = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ saveCharacterMarkdown });
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);

    await user.click(screen.getAllByRole('tab')[2]!);
    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue('# Ayu');
    await user.type(editor, ' edited');

    const [charButton, userButton] = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes('MEMORY.md') || b.textContent?.includes('USER.md'));
    await user.click(userButton!);
    expect(screen.getByRole('textbox')).toHaveValue('# Snow');
    await user.click(charButton!);
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu edited');

    await user.click(screen.getByRole('button', { name: 'Save to database' }));
    expect(saveCharacterMarkdown).toHaveBeenCalledWith('# Ayu edited');
  });

  it('keeps both drafts through tab switches and closing without writing on keystrokes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    const tension = () => screen.getByRole('textbox', { name: translate('memory.tension') });
    await user.clear(tension());
    await user.type(tension(), 'Conflict at the gate');
    await user.click(screen.getAllByRole('tab')[1]!);
    const dynamic = () => screen.getByRole('textbox', { name: translate('memory.dynamic') });
    await user.type(dynamic(), 'Close friends');
    await user.click(screen.getAllByRole('tab')[0]!);
    expect(tension()).toHaveValue('Conflict at the gate');
    rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(tension()).toHaveValue('Conflict at the gate');
    await user.click(screen.getAllByRole('tab')[1]!);
    expect(dynamic()).toHaveValue('Close friends');
    expect(api.updatePsychology).not.toHaveBeenCalled();
    expect(api.updateRelationship).not.toHaveBeenCalled();
  });

  it('keeps a failed psychology draft and saves all changes together on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePsychology).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(undefined);
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    const tension = screen.getByRole('textbox', { name: translate('memory.tension') });
    await user.clear(tension);
    await user.type(tension, 'Conflict');
    await user.click(screen.getByRole('button', { name: translate('memory.intensity', { level: 5 }) }));
    const save = () => screen.getByRole('button', { name: translate('memory.savePsychology') });
    await user.click(save());
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(tension).toHaveValue('Conflict');
    expect(toast.success).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
    vi.mocked(api.getCognitiveOverview).mockResolvedValue({ ...overview, psychology: { ...overview.psychology, psychological_tension: 'Conflict', intensity: 5 } });
    await user.click(save());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(translate('memory.psychSaved')));
    expect(api.updatePsychology).toHaveBeenLastCalledWith('ayu', expect.objectContaining({ psychological_tension: 'Conflict', intensity: 5 }));
    expect(save()).toBeDisabled();
  });

  it('preserves relationship text and added preferences after a failed write', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateRelationship).mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(undefined);
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[1]!);
    const role = screen.getByRole('textbox', { name: translate('memory.roleInStory') });
    await user.type(role, 'Companion');
    await user.type(screen.getByRole('textbox', { name: translate('memory.preferencePlaceholder') }), 'Coffee');
    await user.click(screen.getAllByRole('button', { name: translate('memory.add') })[0]!);
    const save = screen.getByRole('button', { name: translate('memory.saveRelationship') });
    await user.click(save);
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(role).toHaveValue('Companion');
    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    await user.click(save);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(translate('memory.relSaved')));
    expect(api.updateRelationship).toHaveBeenLastCalledWith('ayu', expect.objectContaining({ role_in_story: 'Companion', preferences_habits: ['Tee', 'Coffee'] }));
  });

  it('discards a draft without writing it', async () => {
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    const tension = screen.getByRole('textbox', { name: translate('memory.tension') });
    await user.type(tension, ' changed');
    await user.click(screen.getByRole('button', { name: translate('memory.discardDraft') }));
    expect(tension).toHaveValue('Neugier');
    expect(api.updatePsychology).not.toHaveBeenCalled();
  });

  it('keeps drafts separate when changing characters', async () => {
    const user = userEvent.setup();
    const first = useAppStore.getState().activeCharacter;
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: translate('memory.tension') }), ' for Ayu');
    await act(async () => {
      useAppStore.setState({ activeCharacter: { id: 'sora', card: { data: { name: 'Sora' } } } as CharacterProfile, cognitiveOverview: null });
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: translate('memory.tension') })).toHaveValue('Neugier'));
    expect(screen.getByRole('button', { name: translate('memory.savePsychology') })).toBeDisabled();
    await act(async () => { useAppStore.setState({ activeCharacter: first, cognitiveOverview: null }); });
    expect(screen.getByRole('textbox', { name: translate('memory.tension') })).toHaveValue('Neugier for Ayu');
  });

  it('does not apply an overview that arrives after switching characters', async () => {
    let finish!: (value: CognitiveOverview) => void;
    vi.mocked(api.getCognitiveOverview).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const fetching = useAppStore.getState().fetchCognitiveOverview();
    useAppStore.setState({ activeCharacter: { id: 'sora' } as CharacterProfile, cognitiveOverview: null });
    finish(overview);
    await fetching;
    expect(useAppStore.getState().cognitiveOverview).toBeNull();
  });

  it('keeps a pending save locked after closing and reopening', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    vi.mocked(api.updatePsychology).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { rerender } = render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: translate('memory.tension') }), ' changed');
    await user.click(screen.getByRole('button', { name: translate('memory.savePsychology') }));
    rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: translate('memory.tension') })).toBeDisabled();
    expect(screen.getByRole('button', { name: translate('common.saving') })).toBeDisabled();
    await act(async () => { finish(); });
    expect(screen.getByRole('textbox', { name: translate('memory.tension') })).toBeEnabled();
    expect(api.updatePsychology).toHaveBeenCalledOnce();
  });

  it('keeps relationship drafts separate for different personas', async () => {
    const user = userEvent.setup();
    const persona = useAppStore.getState().activePersona;
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[1]!);
    await user.type(screen.getByRole('textbox', { name: translate('memory.roleInStory') }), 'First persona');
    await act(async () => { useAppStore.setState({ activePersona: { ...persona, name: 'Other' }, cognitiveOverview: null }); });
    expect(screen.getByRole('textbox', { name: translate('memory.roleInStory') })).toHaveValue('');
    await act(async () => { useAppStore.setState({ activePersona: persona, cognitiveOverview: null }); });
    expect(screen.getByRole('textbox', { name: translate('memory.roleInStory') })).toHaveValue('First persona');
  });

  it('keeps the committed value if refreshing after a successful write fails', async () => {
    vi.mocked(api.updatePsychology).mockResolvedValue(undefined);
    vi.mocked(api.getCognitiveOverview).mockRejectedValue(new Error('Read failed'));
    const updated = { ...overview.psychology, psychological_tension: 'Saved' };
    await useAppStore.getState().updatePsychology(updated);
    expect(useAppStore.getState().cognitiveOverview?.psychology).toEqual(updated);
  });

  it('keeps a markdown draft and reports failure when reload fails', async () => {
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[2]!);
    await user.type(screen.getByRole('textbox'), ' edited');
    vi.mocked(api.getUserMemoryMarkdown).mockRejectedValueOnce(new Error('Read failed'));
    await user.click(screen.getByRole('button', { name: translate('memory.mdReload') }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Loading failed: Read failed'));
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu edited');
    expect(useAppStore.getState().characterMarkdown).toBe('# Ayu');
    expect(toast.success).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: translate('memory.mdReload') }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(translate('memory.mdReloadedStatus')));
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu');
  });

  it('locks markdown input and file switching during save, then preserves a rejected draft', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    vi.mocked(api.saveCharacterMemoryMarkdown).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[2]!);
    await user.type(screen.getByRole('textbox'), ' edited');
    await user.click(screen.getByRole('button', { name: translate('memory.mdSync') }));
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /USER.md/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: translate('memory.mdReload') })).toBeDisabled();
    await act(async () => { reject(new Error('Disk full')); });
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu edited');
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(api.saveCharacterMemoryMarkdown).mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: translate('memory.mdSync') }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(translate('memory.mdSyncedStatus')));
    expect(api.saveCharacterMemoryMarkdown).toHaveBeenLastCalledWith('ayu', '# Ayu edited');
  });

  it('retains markdown drafts through tab switches and does not show them for another character', async () => {
    const user = userEvent.setup();
    render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[2]!);
    await user.type(screen.getByRole('textbox'), ' edited');
    await user.click(screen.getAllByRole('tab')[0]!);
    await user.click(screen.getAllByRole('tab')[2]!);
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu edited');
    vi.mocked(api.getCharacterMemoryMarkdown).mockResolvedValue('# Sora');
    await act(async () => { useAppStore.setState({ activeCharacter: { id: 'sora', card: { data: { name: 'Sora' } } } as CharacterProfile }); });
    expect(screen.getByRole('textbox')).toHaveValue('# Sora');
  });

  it('ignores a delayed markdown read after changing personas', async () => {
    let finish!: (value: string) => void;
    vi.mocked(api.getUserMemoryMarkdown).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const fetching = useAppStore.getState().fetchMemoryMarkdown();
    useAppStore.setState({ activePersona: { ...useAppStore.getState().activePersona, name: 'Other' }, characterMarkdown: '# Current', userMarkdown: '# Other' });
    finish('# Old persona');
    await fetching;
    expect(useAppStore.getState().userMarkdown).toBe('# Other');
    expect(useAppStore.getState().characterMarkdown).toBe('# Current');
  });

  it('does not apply a completed markdown save to another character', async () => {
    let finish!: () => void;
    vi.mocked(api.saveCharacterMemoryMarkdown).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const saving = useAppStore.getState().saveCharacterMarkdown('# Edited Ayu');
    useAppStore.setState({ activeCharacter: { id: 'sora' } as CharacterProfile, characterMarkdown: '# Sora' });
    finish();
    await saving;
    expect(useAppStore.getState().characterMarkdown).toBe('# Sora');
  });

  it('retains both markdown files when closing and reopening', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[2]!);
    await user.type(screen.getByRole('textbox'), ' character draft');
    await user.click(screen.getByRole('button', { name: /USER.md/ }));
    await user.type(screen.getByRole('textbox'), ' persona draft');
    rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu character draft');
    await user.click(screen.getByRole('button', { name: /USER.md/ }));
    expect(screen.getByRole('textbox')).toHaveValue('# Snow persona draft');
  });

  it('keeps a reopened markdown draft locked until its pending save fails', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    vi.mocked(api.saveCharacterMemoryMarkdown).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const { rerender } = render(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    await user.click(screen.getAllByRole('tab')[2]!);
    await user.type(screen.getByRole('textbox'), ' draft');
    await user.click(screen.getByRole('button', { name: translate('memory.mdSync') }));
    rerender(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    rerender(<CognitiveMemoryDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    await act(async () => { reject(new Error('Disk full')); });
    expect(screen.getByRole('textbox')).toHaveValue('# Ayu draft');
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(api.saveCharacterMemoryMarkdown).toHaveBeenCalledOnce();
  });

  it('renders nothing while closed', () => {
    const { container } = render(<CognitiveMemoryDrawer isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
