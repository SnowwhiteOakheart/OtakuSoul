import { translate } from '../../../i18n';
import { api } from '../../../services/api';
import { HUD_PRESETS } from '../../../constants/hudPresets';
import { reportFailure } from '../../reportFailure';
import { toast } from '../../../components/ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { UNDO_DELETE_MS, greetingsFor, pendingChatDeletes, toFlat, visibleSessions } from './helpers';
import type { ChatRuntime } from './runtime';
import type { ChatGet, ChatSet, ChatSlice } from './types';

export type ChatSessionsSlice = Pick<
  ChatSlice,
  | 'replyLanguage'
  | 'setReplyLanguage'
  | 'activeChatId'
  | 'isChatLoading'
  | 'chatLoadError'
  | 'retryChatLoad'
  | 'chatSessions'
  | 'storedMessages'
  | 'messages'
  | 'chatSidebarOpen'
  | 'setChatSidebarOpen'
  | 'activeHudPresetId'
  | 'applyHudPreset'
  | 'chatJumpTarget'
  | 'requestChatJump'
  | 'bookmarkedMessageIds'
  | 'toggleBookmark'
  | 'branchChatFrom'
  | 'loadChatSessions'
  | 'switchChatSession'
  | 'createNewChat'
  | 'renameChatSession'
  | 'updateChatStyle'
  | 'deleteChatSession'
  | 'updateAuthorNote'
  | 'clearChat'
  | 'exportCurrentChat'
  | 'exportCurrentChatHtml'
  | 'importChatJsonl'
  | 'updateChatSummary'
  | 'setChatMembers'
>;

export function createChatSessionsSlice(rt: ChatRuntime, set: ChatSet, get: ChatGet): ChatSessionsSlice {
  return {
    replyLanguage: 'Deutsch',

    setReplyLanguage: (replyLanguage) => {
      set({ replyLanguage });
      get().saveCurrentSettings();
    },

    activeChatId: null,
    isChatLoading: false,
    chatLoadError: null,

    retryChatLoad: async () => {
      const { activeChatId, activeCharacter } = get();
      if (activeChatId) await get().switchChatSession(activeChatId);
      else if (activeCharacter) await get().loadChatSessions(activeCharacter.id);
    },

    chatSessions: [],
    storedMessages: [],
    messages: [],
    chatSidebarOpen: false,
    setChatSidebarOpen: (chatSidebarOpen) => set({ chatSidebarOpen }),
    activeHudPresetId: 'romance',

    applyHudPreset: (presetId) => {
      const preset = HUD_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        set({
          activeHudPresetId: presetId,
          stateVariables: preset.defaultVariables,
        });
      }
    },

    chatJumpTarget: null,
    requestChatJump: (messageId) =>
      set((st) => ({ chatJumpTarget: { messageId, nonce: (st.chatJumpTarget?.nonce ?? 0) + 1 } })),

    bookmarkedMessageIds: [],

    toggleBookmark: async (messageId) => {
      const chatId = get().activeChatId;
      if (!chatId) return;
      const bookmarked = !get().bookmarkedMessageIds.includes(messageId);
      try {
        await api.setChatBookmark(chatId, messageId, bookmarked);
        if (get().activeChatId !== chatId) return;
        const order = get().storedMessages.map((m) => m.id);
        set((st) => ({
          bookmarkedMessageIds: bookmarked
            ? [...st.bookmarkedMessageIds, messageId].sort((a, b) => order.indexOf(a) - order.indexOf(b))
            : st.bookmarkedMessageIds.filter((id) => id !== messageId),
        }));
      } catch (e) {
        reportFailure('Failed to set bookmark:', e);
      }
    },

    branchChatFrom: async (messageId, ownMemory = false, fromChat) => {
      const chatId = fromChat ?? get().activeChatId;
      const char = get().activeCharacter;
      if (!chatId || !char) return;
      const original = get().chatSessions.find((s) => s.id === chatId)?.title ?? translate('chat.newChatTitle');
      try {
        const branch = await api.branchChat(
          chatId,
          messageId,
          translate(ownMemory ? 'chat.whatIfTitle' : 'chat.branchTitle', { title: original }),
          ownMemory,
        );
        const sessions = await api.listChatSessions(char.id);
        if (get().activeCharacter?.id !== char.id) return;
        set({ chatSessions: visibleSessions(sessions) });
        await get().switchChatSession(branch.id);
        toast.success(translate(ownMemory ? 'chat.branchedOwnMemory' : 'chat.branched', { title: branch.title }));
      } catch (e) {
        reportFailure('Failed to branch chat:', e);
      }
    },

    loadChatSessions: async (charId) => {
      if (get().activeCharacter?.id !== charId) return;
      const previousChatId = get().activeChatId;
      const request = rt.beginSessionLoad(null);
      set({ chatSessions: [] });
      try {
        let sessions = visibleSessions(await api.listChatSessions(charId));
        if (!rt.isSessionCurrent(request, charId)) return;
        let targetId = sessions.find((session) => session.id === previousChatId)?.id ?? sessions[0]?.id;
        if (!targetId) {
          const greetings = await greetingsFor(get());
          if (!rt.isSessionCurrent(request, charId)) return;
          const session = await api.createChatSession(charId, translate('chat.newChatTitle'), greetings);
          if (!rt.isSessionCurrent(request, charId)) return;
          sessions = visibleSessions(await api.listChatSessions(charId));
          if (!rt.isSessionCurrent(request, charId)) return;
          targetId = session.id;
        }
        set({ chatSessions: visibleSessions(sessions) });
        await get().switchChatSession(targetId);
      } catch (e) {
        console.error('Failed to load chat sessions:', e);
        if (rt.isSessionCurrent(request, charId)) set({ chatLoadError: errorMessage(e) });
      } finally {
        if (rt.isSessionCurrent(request, charId)) set({ isChatLoading: false });
      }
    },

    switchChatSession: async (chatId) => {
      const charId = get().activeCharacter?.id;
      const request = rt.beginSessionLoad(chatId);
      try {
        const stored = await api.getChatMessages(chatId);
        // Bookmarks are a convenience: the chat opens even if they can't be read.
        const bookmarks = await api.listChatBookmarks(chatId).catch(() => [] as string[]);
        if (!rt.isSessionCurrent(request, charId)) return;
        set({ storedMessages: stored, messages: stored.map(toFlat), bookmarkedMessageIds: bookmarks ?? [] });
      } catch (e) {
        console.error('Failed to switch chat session:', e);
        if (rt.isSessionCurrent(request, charId)) set({ chatLoadError: errorMessage(e) });
      } finally {
        if (rt.isSessionCurrent(request, charId)) set({ isChatLoading: false });
      }
    },

    createNewChat: async (title) => {
      const char = get().activeCharacter;
      if (!char) return null;
      const sessionTitle = title || translate('chat.defaultSessionTitle', { n: get().chatSessions.length + 1 });
      const request = rt.beginSessionLoad(null);
      try {
        const greetings = await greetingsFor(get());
        if (!rt.isSessionCurrent(request, char.id)) return null;
        const session = await api.createChatSession(char.id, sessionTitle, greetings);
        if (!rt.isSessionCurrent(request, char.id)) return null;
        const sessions = await api.listChatSessions(char.id);
        if (!rt.isSessionCurrent(request, char.id)) return null;
        set({ chatSessions: visibleSessions(sessions) });
        const switchRequest = rt.getSessionRequest() + 1;
        await get().switchChatSession(session.id);
        return rt.isSessionCurrent(switchRequest, char.id) && get().activeChatId === session.id && !get().chatLoadError
          ? session
          : null;
      } catch (e) {
        console.error('Failed to create new chat:', e);
        if (rt.isSessionCurrent(request, char.id)) set({ chatLoadError: errorMessage(e) });
        return null;
      } finally {
        if (rt.isSessionCurrent(request, char.id)) set({ isChatLoading: false });
      }
    },

    updateChatStyle: async (chatId, style) => {
      await api.updateChatStyle(chatId, style);
      set((st) => ({
        chatSessions: st.chatSessions.map((s) => (s.id === chatId ? { ...s, style: style ?? undefined } : s)),
      }));
    },

    renameChatSession: async (chatId, title) => {
      try {
        await api.renameChatSession(chatId, title);
        set((st) => ({
          chatSessions: st.chatSessions.map((s) => (s.id === chatId ? { ...s, title } : s)),
        }));
      } catch (e) {
        console.error('Failed to rename chat session:', e);
        throw e;
      }
    },

    deleteChatSession: async (chatId) => {
      // Hidden at once (another chat opens), deleted after the undo window.
      const char = get().activeCharacter;
      const removed = get().chatSessions.find((s) => s.id === chatId);
      if (!char || !removed || pendingChatDeletes.has(chatId)) return;
      pendingChatDeletes.add(chatId);
      set((st) => ({ chatSessions: st.chatSessions.filter((s) => s.id !== chatId) }));
      if (get().activeChatId === chatId) await get().loadChatSessions(char.id);
      const commit = async () => {
        try {
          await api.deleteChatSession(chatId);
          pendingChatDeletes.delete(chatId);
        } catch (e) {
          // Still stored: show it in the list again.
          pendingChatDeletes.delete(chatId);
          reportFailure('Failed to delete chat session:', e);
          if (get().activeCharacter?.id === char.id) {
            const sessions = await api.listChatSessions(char.id).catch(() => null);
            if (sessions && get().activeCharacter?.id === char.id) set({ chatSessions: visibleSessions(sessions) });
          }
        }
      };
      const timer = setTimeout(() => void commit(), UNDO_DELETE_MS);
      toast.info(translate('chat.sessionDeleted', { title: removed.title }), {
        label: translate('common.undo'),
        onClick: () => {
          clearTimeout(timer);
          pendingChatDeletes.delete(chatId);
          if (get().activeCharacter?.id !== char.id) return;
          void (async () => {
            try {
              const sessions = await api.listChatSessions(char.id);
              if (get().activeCharacter?.id !== char.id) return;
              set({ chatSessions: visibleSessions(sessions) });
              await get().switchChatSession(chatId);
            } catch (e) {
              reportFailure('Failed to restore chat session:', e);
            }
          })();
        },
      });
    },

    updateAuthorNote: async (authorNote, depth) => {
      const chatId = get().activeChatId;
      if (!chatId) return;
      try {
        await api.updateChatAuthorNote(chatId, authorNote, depth);
        set((st) => ({
          chatSessions: st.chatSessions.map((s) =>
            s.id === chatId ? { ...s, author_note: authorNote, author_note_depth: depth } : s,
          ),
        }));
      } catch (e) {
        console.error('Failed to update author note:', e);
        throw e;
      }
    },

    clearChat: async () => {
      const { activeChatId } = get();
      if (activeChatId) await get().deleteChatSession(activeChatId);
    },

    exportCurrentChat: async (targetPath) => {
      const { activeChatId, activeCharacter, activePersona } = get();
      if (!activeChatId || !activeCharacter) return false;
      try {
        await api.exportChatJsonl(activeChatId, activeCharacter.card.data.name, activePersona.name, targetPath);
        return true;
      } catch (e) {
        reportFailure('Export failed:', e);
        return false;
      }
    },

    exportCurrentChatHtml: async (targetPath) => {
      const { activeChatId, activeCharacter, activePersona } = get();
      if (!activeChatId || !activeCharacter) return false;
      try {
        await api.exportChatHtml(activeChatId, activeCharacter.card.data.name, activePersona.name, targetPath);
        return true;
      } catch (e) {
        reportFailure('Export failed:', e);
        return false;
      }
    },

    importChatJsonl: async (jsonlContent, title) => {
      const char = get().activeCharacter;
      if (!char) return;
      try {
        const imported = await api.importChatJsonl(char.id, jsonlContent, title);
        const sessions = await api.listChatSessions(char.id);
        set({ chatSessions: visibleSessions(sessions) });
        await get().switchChatSession(imported.id);
      } catch (e) {
        console.error('Import failed:', e);
        throw e;
      }
    },

    updateChatSummary: async (summary, summaryUntil) => {
      const chatId = get().activeChatId;
      if (!chatId) return;
      await api.updateChatSummary(chatId, summary, summaryUntil);
      set((st) => ({
        chatSessions: st.chatSessions.map((s) =>
          s.id === chatId ? { ...s, summary, summary_until: summaryUntil } : s,
        ),
      }));
    },

    setChatMembers: async (chatId, members) => {
      const stored = await api.setChatMembers(chatId, members);
      set((st) => ({ chatSessions: st.chatSessions.map((s) => (s.id === chatId ? { ...s, members: stored } : s)) }));
    },
  };
}
