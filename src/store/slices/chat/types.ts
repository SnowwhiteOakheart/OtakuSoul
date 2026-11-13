import type { SliceCreator } from '../../storeTypes';
import type { PromptHits } from '../../helpers';
import type {
  ChatMessage,
  ChatSession,
  ChatStyle,
  ContextUsage,
  StoredChatMessage,
  VoiceConfig,
} from '../../../types';

export type ChatSet = Parameters<SliceCreator<ChatSlice>>[0];
export type ChatGet = Parameters<SliceCreator<ChatSlice>>[1];

export type GenerationFailure = {
  chatId: string;
  message: string;
  /** The error as thrown (coded backend text), for the fix button. */
  cause?: string;
  /** `speak`: a reply by `messageId` (a speaker ID) without a new user message ("reply as"). */
  kind: 'send' | 'swipe' | 'continue' | 'speak';
  messageId: string;
};

/** Chat messages, streaming, sessions, swipes, HUD presets, reply language and voice. */
export interface ChatSlice {
  /** Message to scroll to and highlight (search hit, bookmark); `nonce` repeats a jump. */
  chatJumpTarget: { messageId: string; nonce: number } | null;
  requestChatJump: (messageId: string) => void;
  /** Bookmarked messages of the open chat (important scenes), in story order. */
  bookmarkedMessageIds: string[];
  toggleBookmark: (messageId: string) => Promise<void>;
  /** Continues the chat from `messageId` in a new one; `ownMemory` gives it a memory branch of its own. */
  branchChatFrom: (messageId: string, ownMemory?: boolean, chatId?: string) => Promise<void>;
  replyLanguage: string;
  setReplyLanguage: (lang: string) => void;
  messages: ChatMessage[];
  streamingText: string;
  streamingThought: string;
  isGenerating: boolean;
  generationChatId: string | null;
  generationFailure: GenerationFailure | null;
  retryGeneration: () => Promise<void>;
  /** How full the context window was for the last reply. */
  contextUsage: ContextUsage | null;
  isSummarizing: boolean;
  /** After a reply: summarize the messages that no longer fit once enough have piled up. */
  summarizeDroppedMessages: (usage: ContextUsage | null | undefined, history: StoredChatMessage[]) => void;
  updateChatSummary: (summary: string, summaryUntil: number) => Promise<void>;
  /** Translates a message into the app language with the chat model. */
  translateText: (text: string) => Promise<string>;
  /** Lorebook entries, memories and summary each reply could draw on, by `hitKey` (this session only). */
  promptHits: Record<string, PromptHits>;
  /** The expression tag each reply ended with (`[emotion: …]`, removed from the text), by `hitKey`; this session only. */
  replyEmotionTags: Record<string, string>;
  /** A few short ideas for the user's next message in the open chat, built on `notes` (throws on failure). */
  suggestReplies: (notes?: string) => Promise<string[]>;
  /** "Write for me": the user's next message, built from `notes` if any (throws on failure). */
  draftReply: (notes?: string) => Promise<string>;
  /**
   * Sends a message; retries pass the ID of the already saved user message. In a group chat
   * `replySpeaker` picks who answers ('' = the chat's own character).
   */
  sendMessage: (content: string, files?: File[], storedMessageId?: string, replySpeaker?: string) => Promise<void>;
  /** A reply by one character of a group chat ('' = the chat's own) without a new user message. */
  replyAs: (speakerId: string) => Promise<void>;
  /** Group chat "Auto": the characters keep talking among themselves while the user is quiet. */
  groupAutoTalk: boolean;
  setGroupAutoTalk: (enabled: boolean) => void;
  /**
   * Group chat "Auto": after a character's line the characters decide who speaks next (up to a
   * round of replies). False when nothing was written (busy, the user's turn, a failure).
   */
  continueGroupOnOwn: () => Promise<boolean>;
  /**
   * The chat's character writes on their own (`instruction` says why, given their name); returns
   * the saved message, or null when nothing was written (busy, other chat, failure).
   */
  writeOnOwn: (instruction: (name: string) => string) => Promise<StoredChatMessage | null>;
  /**
   * Like `writeOnOwn`, for a character's chat that is not open: written in the background (a
   * reply in the open chat has priority and stops it). Null when nothing was written.
   */
  writeOnOwnIn: (charId: string, chatId: string, instruction: (name: string) => string) => Promise<StoredChatMessage | null>;
  /**
   * The chat's character sends a selfie (as their message with the picture), drawn from the
   * recent chat and their portrait. Returns the message, or null when no picture came (no image
   * engine, other chat meanwhile); failures are thrown.
   */
  sendSelfie: () => Promise<StoredChatMessage | null>;
  /** A picture of the dream the character just told (`dream` = its text), as their message. */
  sendDreamPicture: (dream: string) => Promise<StoredChatMessage | null>;
  /** Invites characters into a chat or removes them (group chat); throws on failure. */
  setChatMembers: (chatId: string, members: string[]) => Promise<void>;
  /** Who writes the running (or last) reply: '' = the chat's own character, else a guest's ID. */
  generationSpeakerId: string;
  /** Voices of group chat guests by character ID (loaded when they first speak). */
  speakerVoices: Record<string, VoiceConfig | null>;
  /** The voice of a speaker of the open chat ('' = the chat's own character), loading a guest's once. */
  loadSpeakerVoice: (speakerId: string) => Promise<VoiceConfig | null>;
  generationId: string | null;
  abortGeneration: () => Promise<void>;
  /**
   * Voice call barge-in: cuts the last reply of the open chat after what the user heard
   * (`heard`) and marks it as interrupted, so the character knows where she was stopped.
   * Leaves it as it is when the heard words are not found or all of it was heard.
   */
  markReplyInterrupted: (chatId: string, heard: string) => Promise<void>;
  clearChat: () => void;
  activeChatId: string | null;
  isChatLoading: boolean;
  chatLoadError: string | null;
  retryChatLoad: () => Promise<void>;
  chatSessions: ChatSession[];
  storedMessages: StoredChatMessage[];
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (open: boolean) => void;
  activeHudPresetId: string;
  applyHudPreset: (presetId: string) => void;
  loadChatSessions: (charId: string) => Promise<void>;
  switchChatSession: (chatId: string) => Promise<void>;
  createNewChat: (title?: string) => Promise<ChatSession | null>;
  renameChatSession: (chatId: string, title: string) => Promise<void>;
  /** Look and sound of a chat; errors go to the caller. */
  updateChatStyle: (chatId: string, style: ChatStyle | null) => Promise<void>;
  deleteChatSession: (chatId: string) => Promise<void>;
  updateAuthorNote: (authorNote: string, depth: number) => Promise<void>;
  switchMessageSwipe: (msgId: string, swipeIndex: number) => Promise<void>;
  regenerateMessageSwipe: (msgId: string) => Promise<void>;
  editChatMessage: (msgId: string, newContent: string) => Promise<void>;
  deleteChatMessage: (msgId: string) => Promise<void>;
  continueChatMessage: (msgId: string) => Promise<void>;
  /** Writes the open chat as SillyTavern JSONL to `targetPath`; reports failures itself. */
  exportCurrentChat: (targetPath: string) => Promise<boolean>;
  /** The open chat as an HTML replay at `targetPath`. */
  exportCurrentChatHtml: (targetPath: string) => Promise<boolean>;
  importChatJsonl: (jsonlContent: string, title?: string) => Promise<void>;
  autoTtsEnabled: boolean;
  setAutoTtsEnabled: (enabled: boolean) => void;
  activeVoiceConfig: VoiceConfig | null;
  loadVoiceConfigForCharacter: (charId: string) => Promise<void>;
  saveVoiceConfigForCharacter: (charId: string, config: VoiceConfig) => Promise<void>;
}
