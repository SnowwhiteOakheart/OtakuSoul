import { useEffect } from 'react';
import { api } from '../services/api';
import { notify } from '../services/notifications';
import { translate } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/ui/feedback';
import { chatSpeakers, presentedAs } from '../utils/groupChat';
import { inQuietHours, otherChatCandidates, proactiveInstruction, proactiveReason, sentToday } from '../utils/proactive';

/** First look shortly after the start (the chat is loaded by then), then once a minute. */
const FIRST_CHECK_MS = 15_000;
const CHECK_INTERVAL_MS = 60_000;
/** Memories a dream weaves together. */
const DREAM_MEMORIES = 3;
/** Length of what is kept of an off-screen story in the memories. */
const OFFSCREEN_MEMORY_CHARS = 400;
/** Chats of other characters are looked at this often (it reads every character's chat list). */
const OTHER_CHATS_INTERVAL_MS = 10 * 60_000;

/**
 * Lets the character of the open chat write on their own (settings: "Characters write on their
 * own"): after a pause or when a plan of theirs is due, within the quiet time and the daily limit.
 * Runs while the app is open, also hidden in the tray; a local AI that is not running is not
 * started for it.
 */
export function useProactiveMessages(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let checking = false;
    // A dream belongs to the first check that gets as far as deciding (with a local AI that
    // may be later than the start, once its server runs).
    let startup = true;
    let otherChatsCheckedAt = 0;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const wrote = await writeIfDue(startup, () => {
          startup = false;
        });
        if (!wrote && Date.now() - otherChatsCheckedAt >= OTHER_CHATS_INTERVAL_MS) {
          otherChatsCheckedAt = Date.now();
          await writeElsewhereIfDue();
        }
      } catch (e) {
        console.warn('Proactive check failed:', e);
      } finally {
        checking = false;
      }
    };
    const first = window.setTimeout(() => void check(), FIRST_CHECK_MS);
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [enabled]);
}

/** Whether characters may write now at all: switched on, set up, the AI ready and not busy. */
function mayWrite(): boolean {
  const state = useAppStore.getState();
  if (!state.proactive.enabled || !state.settingsLoaded || !state.onboardingCompleted || state.isGenerating) return false;
  return state.selectedBackend !== 'local' || state.serverStatus.state === 'running';
}

/** Opens `chatId` of `charId` in the chat view (from the toast about a message on their own). */
async function openChat(charId: string, chatId: string) {
  const store = useAppStore.getState;
  const character = store().availableCharacters.find((c) => c.id === charId);
  if (!character) return;
  if (store().activeCharacter?.id !== charId) await store().selectCharacter(character);
  if (store().activeChatId !== chatId) await store().switchChatSession(chatId);
  store().setActiveTab('chat');
}

/**
 * A character whose chat is not open writes into their latest chat when a pause or a plan of
 * theirs calls for it (one message per check at most; dreams and off-screen stories stay with
 * the open chat).
 */
async function writeElsewhereIfDue(): Promise<boolean> {
  if (!mayWrite()) return false;
  const state = useAppStore.getState();
  const { proactive } = state;
  if (!proactive.other_chats) return false;
  const now = new Date();
  // Daily limit and quiet time first: they make the reading below unnecessary.
  if (inQuietHours(now, proactive.quiet_start_hour, proactive.quiet_end_hour) || sentToday(proactive.sent, now) >= proactive.max_per_day) {
    return false;
  }
  const others = state.availableCharacters.filter((c) => c.id !== state.activeCharacter?.id);
  const latest = await Promise.all(others.map(async (character) => {
    const sessions = await api.listChatSessions(character.id).catch(() => []);
    return sessions.reduce<(typeof sessions)[number] | null>((a, b) => (!a || b.updated_at > a.updated_at ? b : a), null);
  }));
  const userName = state.activePersona.name;
  for (const session of otherChatCandidates(latest.filter((s) => s !== null), { settings: proactive, activeChatId: state.activeChatId, now })) {
    if (!mayWrite()) return false;
    const [messages, intentions] = await Promise.all([
      api.getChatMessages(session.id).catch(() => null),
      api.getIntentions(session.character_id, userName, false).catch(() => []),
    ]);
    if (!messages) continue;
    const reason = proactiveReason({ settings: useAppStore.getState().proactive, charId: session.character_id, chatId: session.id,
      messages, intentions, now: new Date() });
    if (!reason) continue;
    const stored = await useAppStore.getState().writeOnOwnIn(session.character_id, session.id,
      (name) => proactiveInstruction(reason, name, userName));
    if (!stored) return false;
    useAppStore.getState().recordProactive({
      at: Math.floor(Date.now() / 1000),
      chat_id: stored.chat_id,
      message_id: stored.id,
      intention_id: reason.kind === 'due' ? reason.intention.id : null,
    });
    const character = state.availableCharacters.find((c) => c.id === session.character_id);
    const name = character ? presentedAs(character, state.replyLanguage).name : '';
    const after = useAppStore.getState();
    if (document.hidden || !document.hasFocus()) {
      if (after.proactive.notify) await notify(name, stored.content);
    } else if (after.activeChatId !== session.id || after.activeTab !== 'chat') {
      toast.info(translate('proactive.wroteToYou', { name }), {
        label: translate('proactive.openChat'),
        onClick: () => void openChat(session.character_id, session.id).catch((e) => console.warn('Opening the chat failed:', e)),
      });
    }
    return true;
  }
  return false;
}

/** The character of the open chat writes when it is due; true when a message was written. */
async function writeIfDue(startup: boolean, decided: () => void): Promise<boolean> {
  if (!mayWrite()) return false;
  const state = useAppStore.getState();
  const { proactive, activeCharacter, activeChatId } = state;
  if (!activeCharacter || !activeChatId || state.isChatLoading || state.chatLoadError) return false;

  const userName = state.activePersona.name;
  const intentions = await api.getIntentions(activeCharacter.id, userName, false).catch(() => []);
  decided();
  // Guests of a group chat, as the instruction names them.
  const session = state.chatSessions.find((s) => s.id === activeChatId);
  const guests = chatSpeakers(activeCharacter, session, state.availableCharacters)
    .filter((speaker) => speaker.id)
    .map((speaker) => ({ id: speaker.id, ...presentedAs(speaker.character, state.replyLanguage) }));
  const input = {
    settings: proactive,
    charId: activeCharacter.id,
    chatId: activeChatId,
    messages: state.storedMessages,
    intentions,
    now: new Date(),
  };
  let reason = proactiveReason({ ...input, startup, guests });
  if (reason?.kind === 'offscreen') {
    // Older memories of both may colour what they did; none is fine too.
    const [own, theirs] = await Promise.all([
      api.getDreamMemories(activeCharacter.id, 2).catch(() => null),
      api.getDreamMemories(reason.guest.id, 1).catch(() => null),
    ]);
    reason = { ...reason, memories: [...(own ?? []), ...(theirs ?? [])].map((m) => m.content) };
  }
  if (reason?.kind === 'dream') {
    const memories = (await api.getDreamMemories(activeCharacter.id, DREAM_MEMORIES).catch(() => null)) ?? [];
    // Nothing to dream of yet: an ordinary message after the pause instead.
    reason = memories.length > 0 ? { ...reason, memories: memories.map((m) => m.content) } : proactiveReason(input);
  }
  if (!reason) return false;

  const stored = await state.writeOnOwn((name) => proactiveInstruction(reason, name, userName));
  if (!stored) return false;
  useAppStore.getState().recordProactive({
    at: Math.floor(Date.now() / 1000),
    chat_id: stored.chat_id,
    message_id: stored.id,
    intention_id: reason.kind === 'due' ? reason.intention.id : null,
  });
  // What they did together stays with both, so the guest knows it too when asked.
  if (reason.kind === 'offscreen') {
    const told = stored.content.replace(/\s+/g, ' ').trim().slice(0, OFFSCREEN_MEMORY_CHARS);
    const hostName = presentedAs(activeCharacter, state.replyLanguage).name;
    const source = { chatId: stored.chat_id, messageIds: [stored.id] };
    await Promise.all([
      api.addEpisodicMemory(activeCharacter.id, 'event', translate('offscreen.memory', { name: reason.guest.name, text: told }), 3, source),
      api.addEpisodicMemory(reason.guest.id, 'event', translate('offscreen.memory', { name: hostName, text: told }), 3, source),
    ]).catch((e) => console.warn('Off-screen memory failed:', e));
  }
  // The dream also goes into the character's diary.
  if (reason.kind === 'dream') {
    const title = translate('dreams.diaryTitle', { date: new Date().toLocaleDateString(state.appLanguage) });
    await api.addDiaryEntry(activeCharacter.id, title, stored.content, 'dreamy').catch((e) => console.warn('Dream diary failed:', e));
  }

  const name = presentedAs(activeCharacter, state.replyLanguage).name;
  const after = useAppStore.getState();
  if (document.hidden || !document.hasFocus()) {
    if (after.proactive.notify) await notify(name, stored.content);
  } else if (after.activeTab !== 'chat') {
    toast.info(translate('proactive.wroteToYou', { name }), {
      label: translate('proactive.openChat'),
      onClick: () => useAppStore.getState().setActiveTab('chat'),
    });
  }

  // After a pause a selfie may follow (it takes a while); without a picture the message stands alone.
  if (reason.kind === 'idle' && proactive.with_selfie) {
    await useAppStore.getState().sendSelfie().catch((e) => console.warn('Selfie on their own failed:', e));
  }
  // A picture of the dream, drawn from what was told (it takes a while).
  if (reason.kind === 'dream' && proactive.dream_image) {
    await useAppStore.getState().sendDreamPicture(stored.content).catch((e) => console.warn('Dream picture failed:', e));
  }
  return true;
}
