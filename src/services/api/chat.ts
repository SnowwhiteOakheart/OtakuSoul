import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { TokenEvent } from '../../types/generated/TokenEvent';
import type { ThoughtEvent } from '../../types/generated/ThoughtEvent';
import type {
  AssembledPrompt,
  Attachment,
  BuiltinPromptTemplate,
  ChatRequest,
  ChatSession,
  ChatStyle,
  ChatSummaryRequest,
  DoneEvent,
  GroupRouteRequest,
  MacroInput,
  PromptContext,
  PromptLog,
  ReplyIdeasRequest,
  StoredChatMessage,
  TranslateRequest,
} from '../../types';

export const chatApi = {
  /** `contextTokens`: context window of a cloud model; a local server reports its own. */
  /** `tools`: the model may call the chat tools (date/time, calculator, web search). */
  sendChatMessage: async (request: ChatRequest, generationId: string, contextTokens?: number, tools = false): Promise<DoneEvent> => {
    return await invoke<DoneEvent>('send_chat_message', { request, generationId, contextTokens: contextTokens ?? null, tools });
  },

  abortChatGeneration: async (): Promise<void> => {
    return await invoke<void>('abort_chat_generation');
  },

  /** System prompt plus the instruction sent after the chat history. */
  assemblePrompt: async (context: PromptContext): Promise<AssembledPrompt> => {
    return await invoke<AssembledPrompt>('assemble_prompt', { context });
  },

  listPromptTemplates: async (): Promise<BuiltinPromptTemplate[]> => {
    return await invoke<BuiltinPromptTemplate[]>('list_prompt_templates');
  },

  /** The prompt the chat model got last (null before the first message). */
  getLastPrompt: async (): Promise<PromptLog | null> => {
    return await invoke<PromptLog | null>('get_last_prompt');
  },

  /** Creates the chat and the character's greetings (first one shown, the rest as swipes) in one step. */
  createChatSession: async (characterId: string, title: string, greetings: string[] = []): Promise<ChatSession> => {
    return await invoke<ChatSession>('create_chat_session', { characterId, title, greetings });
  },

  /** Look and sound of one chat; null restores the defaults. */
  updateChatStyle: async (chatId: string, style: ChatStyle | null): Promise<void> => {
    await invoke('update_chat_style', { chatId, style });
  },

  listChatSessions: async (characterId: string): Promise<ChatSession[]> => {
    return await invoke<ChatSession[]>('list_chat_sessions', { characterId });
  },

  getChatSession: async (chatId: string): Promise<ChatSession | null> => {
    return await invoke<ChatSession | null>('get_chat_session', { chatId });
  },

  deleteChatSession: async (chatId: string): Promise<void> => {
    return await invoke<void>('delete_chat_session', { chatId });
  },

  renameChatSession: async (chatId: string, newTitle: string): Promise<void> => {
    return await invoke<void>('rename_chat_session', { chatId, newTitle });
  },

  updateChatAuthorNote: async (
    chatId: string,
    authorNote: string,
    authorNoteDepth: number
  ): Promise<void> => {
    return await invoke<void>('update_chat_author_note', {
      chatId,
      authorNote,
      authorNoteDepth,
    });
  },

  /** Folds the messages that left the context window into the chat's running summary. */
  summarizeChat: async (request: ChatSummaryRequest): Promise<ChatSession> => {
    return await invoke<ChatSession>('summarize_chat', { request });
  },

  /** A few short ideas for the user's next message, from the end of the chat. */
  suggestChatReplies: async (request: ReplyIdeasRequest): Promise<string[]> => {
    return await invoke<string[]>('suggest_chat_replies', { request });
  },

  /** Fills the macros ({{char}}, {{random:…}}, {{roll:…}}, {{time}} …) of texts stored as they are. */
  expandMacros: async (texts: string[], input: MacroInput): Promise<string[]> => {
    return await invoke<string[]>('expand_macros', { texts, input });
  },

  /** "Write for me": the user's next message, built from their notes if any. */
  draftChatReply: async (request: ReplyIdeasRequest): Promise<string> => {
    return await invoke<string>('draft_chat_reply', { request });
  },

  /** Translates one chat message with the chat model. */
  translateMessage: async (request: TranslateRequest): Promise<string> => {
    return await invoke<string>('translate_message', { request });
  },

  updateChatSummary: async (chatId: string, summary: string, summaryUntil: number): Promise<void> => {
    return await invoke<void>('update_chat_summary', { chatId, summary, summaryUntil });
  },

  getChatMessages: async (chatId: string): Promise<StoredChatMessage[]> => {
    return await invoke<StoredChatMessage[]>('get_chat_messages', { chatId });
  },

  /** `speakerId`: the character of a reply in a group chat (empty = the chat's own). */
  addChatMessage: async (
    chatId: string,
    role: string,
    content: string,
    thought?: string | null,
    attachments?: Attachment[],
    speakerId?: string | null,
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('add_chat_message', {
      chatId,
      role,
      content,
      thought: thought ?? null,
      attachments: attachments ?? null,
      speakerId: speakerId || null,
    });
  },

  /** Group chat: the name of who answers next, or "PLAYER" for the user's turn. */
  routeGroupChat: async (request: GroupRouteRequest): Promise<string> => {
    return await invoke<string>('route_group_chat', { request });
  },

  /** Invites characters into a chat (group chat); returns the stored guest IDs. */
  setChatMembers: async (chatId: string, members: string[]): Promise<string[]> => {
    return await invoke<string[]>('set_chat_members', { chatId, members });
  },

  /** Stores a file for the next message; `data` is base64. */
  saveAttachment: async (chatId: string, name: string, data: string): Promise<Attachment> => {
    return await invoke<Attachment>('save_attachment', { chatId, name, data });
  },

  getAttachmentDataUrl: async (attachment: Attachment): Promise<string | null> => {
    return await invoke<string | null>('get_attachment_data_url', { attachment });
  },

  updateChatMessage: async (
    msgId: string,
    content: string,
    thought?: string | null
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('update_chat_message', {
      msgId,
      content,
      thought: thought ?? null,
    });
  },

  addMessageSwipe: async (
    msgId: string,
    content: string,
    thought?: string | null
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('add_message_swipe', {
      msgId,
      content,
      thought: thought ?? null,
    });
  },

  switchMessageSwipe: async (
    msgId: string,
    swipeIndex: number
  ): Promise<StoredChatMessage> => {
    return await invoke<StoredChatMessage>('switch_message_swipe', {
      msgId,
      swipeIndex,
    });
  },

  deleteChatMessage: async (msgId: string): Promise<void> => {
    return await invoke<void>('delete_chat_message', { msgId });
  },

  deleteMessagesAfter: async (
    chatId: string,
    orderIndex: number
  ): Promise<void> => {
    return await invoke<void>('delete_messages_after', {
      chatId,
      orderIndex,
    });
  },

  /** The chat as SillyTavern JSONL; with `targetPath` the backend also writes it there. */
  exportChatJsonl: async (
    chatId: string,
    charName: string,
    userName: string,
    targetPath?: string | null,
  ): Promise<string> => {
    return await invoke<string>('export_chat_jsonl', {
      chatId,
      charName,
      userName,
      targetPath: targetPath ?? null,
    });
  },

  /** The chat as an HTML replay, written to `targetPath` by the backend. */
  exportChatHtml: async (chatId: string, charName: string, userName: string, targetPath: string): Promise<void> => {
    await invoke<void>('export_chat_html', { chatId, charName, userName, targetPath });
  },

  importChatJsonl: async (
    characterId: string,
    jsonlContent: string,
    titleOverride?: string | null
  ): Promise<ChatSession> => {
    return await invoke<ChatSession>('import_chat_jsonl', {
      characterId,
      jsonlContent,
      titleOverride: titleOverride ?? null,
    });
  },

  /** New chat with the history up to and including `messageId`. */
  branchChat: async (chatId: string, messageId: string, title: string, ownMemory = false): Promise<ChatSession> => {
    return await invoke<ChatSession>('branch_chat', { chatId, messageId, title, ownMemory });
  },

  listChatBookmarks: async (chatId: string): Promise<string[]> => {
    return await invoke<string[]>('list_chat_bookmarks', { chatId });
  },

  setChatBookmark: async (chatId: string, messageId: string, bookmarked: boolean): Promise<void> => {
    await invoke('set_chat_bookmark', { chatId, messageId, bookmarked });
  },

  // Streaming Listeners
  onLlmToken: async (callback: (data: TokenEvent) => void): Promise<UnlistenFn> => {
    return await listen<TokenEvent>('llm-token', (event) => {
      callback(event.payload);
    });
  },

  onLlmThought: async (callback: (data: ThoughtEvent) => void): Promise<UnlistenFn> => {
    return await listen<ThoughtEvent>('llm-thought', (event) => {
      callback(event.payload);
    });
  },

  onLlmDone: async (callback: (data: DoneEvent) => void): Promise<UnlistenFn> => {
    return await listen<DoneEvent>('llm-done', (event) => {
      callback(event.payload);
    });
  },
};
