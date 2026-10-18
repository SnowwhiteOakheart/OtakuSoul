// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/voice/VoiceCallControls', () => ({ VoiceCallControls: () => null }));
import { api } from '../services/api';
import { streamingTts } from '../services/streamingTts';
import { useAppStore } from '../store/useAppStore';
import { ChatComposer } from '../components/chat/ChatComposer';
import { resetApiMocks } from './mockApi';
import { readDraft } from '../utils/drafts';
import type { CharacterProfile, ChatSession, StoredChatMessage, VoiceConfig } from '../types';
const initial = useAppStore.getState();
const character = { id: 'ayu', card: { data: { name: 'Ayu' } } } as CharacterProfile;
const session: ChatSession = { id: 'chat-1', character_id: 'ayu', title: 'First', created_at: 0, updated_at: 0, author_note: '', author_note_depth: 0, message_count: 1, summary: '', summary_until: -1 };
const message: StoredChatMessage = { id: 'message-1', chat_id: 'chat-1', role: 'user', content: 'First chat', thought: null, order_index: 0, swipe_index: 0, swipes: [], created_at: 0, attachments: [] };
const other = { ...message, id: 'message-2', chat_id: 'chat-2', content: 'Second chat' };
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', activeCharacter: character, activeChatId: session.id, chatSessions: [session], storedMessages: [message], messages: [{ role: 'user', content: message.content }] }, true);
  vi.mocked(api.getChatMessages).mockResolvedValue([message]);
  vi.mocked(api.listChatSessions).mockResolvedValue([session]);
  vi.spyOn(streamingTts, 'cancel');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('chat session loading', () => {
  it('clears the old history immediately and only accepts the latest overlapping selection', async () => {
    let finishFirst!: (value: StoredChatMessage[]) => void;
    vi.mocked(api.getChatMessages).mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce([other]);
    const first = useAppStore.getState().switchChatSession('chat-1');
    expect(streamingTts.cancel).toHaveBeenCalled();
    expect(useAppStore.getState().storedMessages).toEqual([]);
    expect(useAppStore.getState().isChatLoading).toBe(true);
    await useAppStore.getState().switchChatSession('chat-2');
    finishFirst([message]);
    await first;
    expect(useAppStore.getState().activeChatId).toBe('chat-2');
    expect(useAppStore.getState().storedMessages).toEqual([other]);
    expect(useAppStore.getState().isChatLoading).toBe(false);
  });
  it('ignores a late load failure after another selection succeeded', async () => {
    let fail!: () => void;
    vi.mocked(api.getChatMessages).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new Error('Old read failure')); })).mockResolvedValueOnce([other]);
    const old = useAppStore.getState().switchChatSession('chat-1');
    await useAppStore.getState().switchChatSession('chat-2');
    fail(); await old;
    expect(useAppStore.getState().chatLoadError).toBeNull();
    expect(useAppStore.getState().storedMessages).toEqual([other]);
  });
  it('keeps each chat its own composer draft, also across a restart', async () => {
    const user = userEvent.setup();
    const first = render(<ChatComposer />);
    await user.type(screen.getByRole('textbox'), 'Für den ersten Chat');
    vi.mocked(api.getChatMessages).mockResolvedValueOnce([other]);
    await useAppStore.getState().switchChatSession('chat-2');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    await user.type(screen.getByRole('textbox'), 'Zweiter');
    await useAppStore.getState().switchChatSession('chat-1');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Für den ersten Chat'));

    // A restart mounts the composer anew; the draft comes back from the device.
    first.unmount();
    render(<ChatComposer />);
    expect(screen.getByRole('textbox')).toHaveValue('Für den ersten Chat');
  });
  it('shows load errors, blocks sending and retains the composer draft through retry', async () => {
    render(<ChatComposer />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'Unsent draft');
    vi.mocked(api.getChatMessages).mockRejectedValueOnce(new Error('History unavailable'));
    await useAppStore.getState().switchChatSession('chat-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expect(useAppStore.getState().sendMessage('Attempt')).rejects.toThrow('History unavailable');
    expect(api.addChatMessage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue('Unsent draft');
    expect(useAppStore.getState().storedMessages).toEqual([message]);
  });
  it('blocks sending during an incomplete history read', async () => {
    let finish!: (value: StoredChatMessage[]) => void;
    vi.mocked(api.getChatMessages).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useAppStore.getState().switchChatSession('chat-2');
    await expect(useAppStore.getState().sendMessage('Attempt')).rejects.toThrow('Loading chat history');
    expect(api.addChatMessage).not.toHaveBeenCalled();
    finish([other]); await pending;
  });
  it('does not select an older character after its session list arrives late', async () => {
    let finish!: (value: ChatSession[]) => void;
    vi.mocked(api.listChatSessions).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce([{ ...session, id: 'chat-2', character_id: 'sora' }]);
    const pending = useAppStore.getState().loadChatSessions('ayu');
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' } });
    vi.mocked(api.getChatMessages).mockResolvedValueOnce([other]);
    await useAppStore.getState().loadChatSessions('sora');
    finish([session]); await pending;
    expect(useAppStore.getState().activeChatId).toBe('chat-2');
    expect(useAppStore.getState().chatSessions[0]?.character_id).toBe('sora');
  });
  it('does not replace a manual selection with a late session list', async () => {
    let finish!: (value: ChatSession[]) => void;
    vi.mocked(api.listChatSessions).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useAppStore.getState().loadChatSessions('ayu');
    vi.mocked(api.getChatMessages).mockResolvedValueOnce([other]);
    await useAppStore.getState().switchChatSession('chat-2');
    finish([session]); await pending;
    expect(useAppStore.getState().activeChatId).toBe('chat-2');
    expect(useAppStore.getState().storedMessages).toEqual([other]);
  });
  it('offers the alternative greetings in the reply language as swipes of a new chat', async () => {
    const translated = { first_mes: 'Hallo {{user}}!', alternate_greetings: ['Na, {{user}}?'] };
    useAppStore.setState({
      replyLanguage: 'Deutsch',
      activePersona: { ...initial.activePersona, name: 'Kai' },
      activeCharacter: { ...character, card: { data: { name: 'Ayu', first_mes: 'Hi {{user}}!', alternate_greetings: ['Hey?', ' '], extensions: { otakusoul_i18n: { translations: { de: translated } } } } } } as unknown as CharacterProfile,
    });
    vi.mocked(api.expandMacros).mockImplementationOnce(async (texts, input) => texts.map((text) => text.replace('{{user}}', input.user_name)));
    vi.mocked(api.createChatSession).mockResolvedValueOnce(session);
    await useAppStore.getState().createNewChat('Neu');
    // Macros are filled once by the backend (names, chance, time), the language picks the texts.
    expect(api.expandMacros).toHaveBeenCalledWith(['Hallo {{user}}!', 'Na, {{user}}?'], { char_name: 'Ayu', user_name: 'Kai', language: 'Deutsch' });
    expect(api.createChatSession).toHaveBeenCalledWith('ayu', 'Neu', ['Hallo Kai!', 'Na, Kai?']);
  });
  it('offers reply ideas for the open chat and puts a picked one into the input', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ ensureLocalAi: vi.fn().mockResolvedValue(undefined), activePersona: { ...initial.activePersona, name: 'Kai', description: 'Reisender' } });
    vi.mocked(api.suggestChatReplies).mockResolvedValueOnce(['*nickt*', 'Wohin?']);
    render(<ChatComposer />);
    await user.click(screen.getByRole('button', { name: 'What could I say?' }));
    expect(api.suggestChatReplies).toHaveBeenCalledWith(expect.objectContaining({ chat_id: 'chat-1', char_name: 'Ayu', user_name: 'Kai', user_description: 'Reisender' }));
    await user.click(await screen.findByRole('button', { name: 'Wohin?' }));
    expect(screen.getByRole('textbox')).toHaveValue('Wohin?');
    expect(screen.queryByRole('group', { name: 'Reply ideas' })).toBeNull();

    // Ideas belong to their chat: another chat doesn't show them.
    vi.mocked(api.suggestChatReplies).mockResolvedValueOnce(['Hallo?']);
    await user.click(screen.getByRole('button', { name: 'What could I say?' }));
    await screen.findByRole('button', { name: 'Hallo?' });
    vi.mocked(api.getChatMessages).mockResolvedValueOnce([other]);
    await useAppStore.getState().switchChatSession('chat-2');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hallo?' })).toBeNull());
  });
  it('writes the next message from the typed notes and can undo it', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ ensureLocalAi: vi.fn().mockResolvedValue(undefined) });
    let finish!: (text: string) => void;
    vi.mocked(api.draftChatReply).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ChatComposer />);
    await user.type(screen.getByRole('textbox'), 'Weg fragen');
    await user.click(screen.getByRole('button', { name: 'Write for me' }));
    expect(api.draftChatReply).toHaveBeenCalledWith(expect.objectContaining({ chat_id: 'chat-1', notes: 'Weg fragen' }));
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'What could I say?' })).toBeDisabled();
    finish('*zeigt auf die Karte* "Wohin geht es?"');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('*zeigt auf die Karte* "Wohin geht es?"'));
    expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly');
  });
  it('keeps a draft that arrives after switching chats for its own chat', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ ensureLocalAi: vi.fn().mockResolvedValue(undefined) });
    let finish!: (text: string) => void;
    vi.mocked(api.draftChatReply).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ChatComposer />);
    await user.click(screen.getByRole('button', { name: 'Write for me' }));
    vi.mocked(api.getChatMessages).mockResolvedValueOnce([other]);
    await useAppStore.getState().switchChatSession('chat-2');
    finish('Für den ersten Chat');
    await waitFor(() => expect(readDraft('composer:chat-1')).toBe('Für den ersten Chat'));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('does not activate a new chat created for an outdated character', async () => {
    let finish!: (value: ChatSession) => void;
    vi.mocked(api.createChatSession).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useAppStore.getState().createNewChat();
    await waitFor(() => expect(api.createChatSession).toHaveBeenCalled());
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' } });
    finish(session);
    expect(await pending).toBeNull();
    expect(api.getChatMessages).not.toHaveBeenCalled();
    expect(api.addChatMessage).not.toHaveBeenCalled();
  });
  it('displays list errors and retries without adding an extra session', async () => {
    vi.mocked(api.listChatSessions).mockRejectedValueOnce(new Error('List unavailable'));
    await useAppStore.getState().loadChatSessions('ayu');
    expect(useAppStore.getState().chatLoadError).toBe('List unavailable');
    expect(useAppStore.getState().isChatLoading).toBe(false);
    await useAppStore.getState().retryChatLoad();
    expect(useAppStore.getState().chatLoadError).toBeNull();
    expect(api.createChatSession).not.toHaveBeenCalled();
  });
  it('reports automatic session-creation failures before saving a user message', async () => {
    useAppStore.setState({ activeChatId: null });
    vi.mocked(api.createChatSession).mockRejectedValueOnce(new Error('Creation failed'));
    await expect(useAppStore.getState().sendMessage('Draft')).rejects.toThrow('Creation failed');
    expect(useAppStore.getState().isGenerating).toBe(false);
    expect(api.addChatMessage).not.toHaveBeenCalled();
  });
  it('does not apply an outdated voice configuration to the new character', async () => {
    let finish!: (value: VoiceConfig) => void;
    vi.mocked(api.getCharacterVoiceConfig).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = useAppStore.getState().loadVoiceConfigForCharacter('ayu');
    useAppStore.setState({ activeCharacter: { ...character, id: 'sora' } });
    const currentConfig = { engine: 'disabled' } as VoiceConfig;
    useAppStore.setState({ activeVoiceConfig: currentConfig });
    finish({ engine: 'kokoro' } as VoiceConfig); await pending;
    expect(useAppStore.getState().activeVoiceConfig).toBe(currentConfig);
  });
});
