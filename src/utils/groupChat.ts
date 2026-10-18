import type { CharacterProfile, ChatMessage, ChatSession, GroupMember, StoredChatMessage } from '../types';
import { languageCode, localizeCard } from './cardI18n';

/** Invited characters a chat can have besides its own (as `MAX_CHAT_GUESTS` in `memory/chats.rs`). */
export const MAX_CHAT_GUESTS = 4;

/** Replies one user message may set off in a group chat before it is the user's turn again. */
export const GROUP_MAX_REPLIES = 3;

/** The guests of a chat that still exist in the library (removed cards drop out). */
export function chatGuests(session: ChatSession | undefined, characters: CharacterProfile[]): CharacterProfile[] {
  return (session?.members ?? [])
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is CharacterProfile => !!c);
}

/** Everyone who can speak in a chat: its own character ('' as speaker ID) first, then the guests. */
export function chatSpeakers(
  host: CharacterProfile | null,
  session: ChatSession | undefined,
  characters: CharacterProfile[],
): { id: string; character: CharacterProfile }[] {
  if (!host) return [];
  return [{ id: '', character: host }, ...chatGuests(session, characters).map((character) => ({ id: character.id, character }))];
}

/** The card's name and a short description in the reply language. */
export function presentedAs(character: CharacterProfile, replyLanguage: string): GroupMember {
  const data = localizeCard(character.card.data, languageCode(replyLanguage));
  const description = (data.description || data.personality || '').replace(/\s+/g, ' ').trim();
  return { name: data.name || character.card.data.name, description: description.slice(0, 300) };
}

/**
 * The history as one speaker of a group chat sees it: their own replies stay `assistant`, everyone
 * else's lines (the user's too) become `user` turns that start with the speaker's name, so the
 * model can tell the voices apart and does not continue someone else's line.
 */
export function groupHistory(
  stored: StoredChatMessage[],
  speakerId: string,
  nameOf: (speakerId: string) => string,
  userName: string,
): ChatMessage[] {
  return stored.map((m) => {
    const flat: ChatMessage = {
      role: m.role,
      content: m.content,
      thought: m.thought || undefined,
      attachments: m.attachments.length > 0 ? m.attachments : undefined,
    };
    if (m.role === 'system' || (m.role === 'assistant' && (m.speaker_id ?? '') === speakerId)) return flat;
    const name = m.role === 'user' ? userName : nameOf(m.speaker_id ?? '');
    return { ...flat, role: 'user', thought: undefined, content: `${name}: ${m.content}` };
  });
}

/**
 * Whose memory the memory drawer shows: the chosen guest while they are a guest of the open
 * chat, otherwise the active character (also after switching chats or characters).
 */
export function memoryCharacter(state: {
  memoryCharacterId: string | null;
  activeCharacter: CharacterProfile | null;
  activeChatId: string | null;
  chatSessions: ChatSession[];
  availableCharacters: CharacterProfile[];
}): CharacterProfile | null {
  const id = state.memoryCharacterId;
  if (id && state.activeCharacter && id !== state.activeCharacter.id) {
    const guest = chatGuests(state.chatSessions.find((s) => s.id === state.activeChatId), state.availableCharacters)
      .find((c) => c.id === id);
    if (guest) return guest;
  }
  return state.activeCharacter;
}
