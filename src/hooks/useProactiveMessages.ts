import { useEffect } from 'react';
import { api } from '../services/api';
import { notify } from '../services/notifications';
import { translate } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/ui/feedback';
import { presentedAs } from '../utils/groupChat';
import { proactiveInstruction, proactiveReason } from '../utils/proactive';

/** First look shortly after the start (the chat is loaded by then), then once a minute. */
const FIRST_CHECK_MS = 15_000;
const CHECK_INTERVAL_MS = 60_000;

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
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await writeIfDue();
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

async function writeIfDue() {
  const state = useAppStore.getState();
  const { proactive, activeCharacter, activeChatId } = state;
  if (!proactive.enabled || !state.settingsLoaded || !state.onboardingCompleted) return;
  if (!activeCharacter || !activeChatId || state.isGenerating || state.isChatLoading || state.chatLoadError) return;
  if (state.selectedBackend === 'local' && state.serverStatus.state !== 'running') return;

  const userName = state.activePersona.name;
  const intentions = await api.getIntentions(activeCharacter.id, userName, false).catch(() => []);
  const reason = proactiveReason({
    settings: proactive,
    charId: activeCharacter.id,
    chatId: activeChatId,
    messages: state.storedMessages,
    intentions,
    now: new Date(),
  });
  if (!reason) return;

  const stored = await state.writeOnOwn((name) => proactiveInstruction(reason, name, userName));
  if (!stored) return;
  useAppStore.getState().recordProactive({
    at: Math.floor(Date.now() / 1000),
    chat_id: stored.chat_id,
    message_id: stored.id,
    intention_id: reason.kind === 'due' ? reason.intention.id : null,
  });

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
}
