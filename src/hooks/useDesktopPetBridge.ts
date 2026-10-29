import { useEffect } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { audioPlayer } from '../services/audioPlayer';
import { streamingTts } from '../services/streamingTts';
import { api } from '../services/api';
import { manualEmotion, resolveInochi2dPath, resolveLive2dPath, resolveVrmPath } from '../components/avatars/avatarMatch';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import {
  PET_AUDIO_EVENT,
  PET_HELLO_EVENT,
  PET_LABEL,
  PET_PICK_EMOTION_EVENT,
  PET_READY_EVENT,
  PET_SAY_EVENT,
  PET_SEND_EVENT,
  PET_SENTENCE_EVENT,
  PET_STATE_EVENT,
  PET_TOGGLE_EVENT,
  PET_VISIBILITY_EVENT,
  PORTRAIT_PREFIX,
  loadPetOpen,
  loadPetPrefs,
  type PetAudioFrame,
  type PetSay,
  type PetSentence,
  type PetState,
} from '../services/desktopPet';
import { bubbleText } from '../components/companion/petBehavior';
import { translate } from '../i18n';
import { isNightHour, NIGHT_VOLUME } from '../utils/dayTime';
import { errorMessage } from '../utils/errors';

/** A reply counts as new this long after a generation ended (also a regenerated one). */
const AFTER_GENERATION_MS = 10_000;
/** …or while it is at most this old (replies written on their own, without a generation here). */
const FRESH_REPLY_S = 120;

/** Voice frames to the pet at most this often (mouth shapes are smoothed there). */
const AUDIO_FRAME_MS = 33;

type StoreState = ReturnType<typeof useAppStore.getState>;

/** The figure's latest finished reply in the open chat (id and shown swipe), or null. */
function lastReplyKey(s: StoreState): string | null {
  const last = s.storedMessages[s.storedMessages.length - 1];
  return last && last.role === 'assistant' ? `${last.id}:${last.swipe_index}` : null;
}

/** The figure's models the pet chooses from (also the Desktop-Pet tab's preview). */
export function petModels(
  s: Pick<
    StoreState,
    | 'activeCharacter'
    | 'scannedVrms'
    | 'activeVrmPath'
    | 'scannedInochi2ds'
    | 'activeInochi2dPath'
    | 'scannedLive2ds'
    | 'activeLive2dPath'
    | 'avatarMode'
  >,
): Pick<PetState, 'modelPath' | 'vrmPath' | 'inochi2dPath' | 'live2dPath' | 'portraitPath' | 'portrait'> {
  const vrmPath = resolveVrmPath(s.activeCharacter, s.scannedVrms, s.activeVrmPath);
  const inochi2dPath = resolveInochi2dPath(s.activeCharacter, s.scannedInochi2ds, s.activeInochi2dPath);
  const live2dPath = resolveLive2dPath(s.activeCharacter, s.scannedLive2ds, s.activeLive2dPath);
  const portrait = s.activeCharacter?.avatar_data_url ?? '';
  const portraitPath = portrait ? `${PORTRAIT_PREFIX}${s.activeCharacter?.id ?? ''}` : '';
  // The chat shows an Inochi2D puppet or a Live2D model: the pet shows it too; otherwise the
  // 3D model (unless the pet's menu asks for another). Without a 3D model it takes what the
  // figure has: a Live2D model, an Inochi2D puppet or at least the portrait.
  const shown =
    (s.avatarMode === 'inochi2d' && inochi2dPath) ||
    (s.avatarMode === 'live2d' && live2dPath) ||
    (s.avatarMode === '2d' && !vrmPath && portraitPath) ||
    vrmPath ||
    live2dPath ||
    inochi2dPath ||
    portraitPath;
  return { modelPath: shown, vrmPath, inochi2dPath, live2dPath: live2dPath ?? '', portraitPath, portrait };
}

function petState(s: StoreState): PetState {
  return {
    characterName: s.activeCharacter?.card.data.name || APP_DEFAULT_COMPANION_NAME,
    ...petModels(s),
    emotion: s.currentEmotion.emotion,
    expression: s.currentEmotion.vrm_expression,
    motions: s.avatarMotions,
    gesture: s.avatarGesture,
    appLanguage: s.appLanguage,
    theme: s.theme,
    colorMode: s.colorMode,
    thinking: s.isGenerating,
  };
}

/**
 * Main window side of the desktop pet: while the pet window is open it gets the active figure,
 * mood, gestures and the voice's mouth shapes; moods picked in the pet's menu come back here.
 */
export function useDesktopPetBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let isSubscribed = true;
    let open = false;
    let lastSent = '';
    let staleGestureId: number | null = null;
    /** The portrait the pet has (a data URL, often MBs): it goes along only when it changed. */
    let sentPortrait: string | null = null;

    const send = (force = false) => {
      if (!open) return;
      const state = petState(useAppStore.getState());
      // A gesture plays once: a freshly opened pet does not repeat the one from before.
      if (force) staleGestureId = state.gesture?.id ?? null;
      const portraitChanged = force || state.portrait !== sentPortrait;
      const payload: PetState = {
        ...state,
        gesture: state.gesture?.id === staleGestureId ? null : state.gesture,
        portrait: portraitChanged ? state.portrait : undefined,
      };
      const key = JSON.stringify({ ...payload, portrait: undefined });
      if (!force && !portraitChanged && key === lastSent) return;
      lastSent = key;
      sentPortrait = state.portrait ?? '';
      void emitTo(PET_LABEL, PET_STATE_EVENT, payload).catch(() => {});
    };

    // Replies already there when a chat opens are not announced; new and regenerated ones are.
    let replyChat = useAppStore.getState().activeChatId;
    let seenReply = lastReplyKey(useAppStore.getState());
    let generationEndedAt = 0;
    const announceReply = (s: StoreState) => {
      if (s.activeChatId !== replyChat) {
        replyChat = s.activeChatId;
        seenReply = lastReplyKey(s);
        return;
      }
      if (s.isGenerating) return;
      const key = lastReplyKey(s);
      if (!key || key === seenReply) return;
      seenReply = key;
      const last = s.storedMessages[s.storedMessages.length - 1]!;
      // A chat's history arrives after the chat switch: its last reply is old, not new.
      const fresh =
        Date.now() - generationEndedAt < AFTER_GENERATION_MS || Date.now() / 1000 - last.created_at < FRESH_REPLY_S;
      if (!fresh) return;
      const text = bubbleText(last.content);
      if (open && text) void emitTo(PET_LABEL, PET_SAY_EVENT, { text } satisfies PetSay).catch(() => {});
    };

    const unsubscribeStore = useAppStore.subscribe((s, prev) => {
      if (prev.isGenerating && !s.isGenerating) generationEndedAt = Date.now();
      if (s.storedMessages !== prev.storedMessages || s.isGenerating !== prev.isGenerating || s.activeChatId !== prev.activeChatId) {
        announceReply(s);
      }
      if (
        s.activeCharacter !== prev.activeCharacter ||
        s.scannedVrms !== prev.scannedVrms ||
        s.activeVrmPath !== prev.activeVrmPath ||
        // Switching the chat's view (3D ↔ Inochi2D) or its puppet changes the pet's figure.
        s.avatarMode !== prev.avatarMode ||
        s.scannedInochi2ds !== prev.scannedInochi2ds ||
        s.activeInochi2dPath !== prev.activeInochi2dPath ||
        s.scannedLive2ds !== prev.scannedLive2ds ||
        s.activeLive2dPath !== prev.activeLive2dPath ||
        s.currentEmotion !== prev.currentEmotion ||
        s.avatarMotions !== prev.avatarMotions ||
        s.avatarGesture !== prev.avatarGesture ||
        s.appLanguage !== prev.appLanguage ||
        s.theme !== prev.theme ||
        s.colorMode !== prev.colorMode ||
        s.isGenerating !== prev.isGenerating ||
        s.localeRevision !== prev.localeRevision
      ) {
        send();
      }
    });

    let lastFrameAt = 0;
    let voiced = false;
    const stopFrames = audioPlayer.onAudioFrame((amplitude, visemes) => {
      if (!open) return;
      const playing = audioPlayer.isPlaying();
      const now = performance.now();
      // The last silent frame always goes, or the pet's mouth would stay open.
      if (playing && now - lastFrameAt < AUDIO_FRAME_MS) return;
      if (!playing && !voiced) return;
      lastFrameAt = now;
      voiced = playing;
      const frame: PetAudioFrame = { amplitude, visemes: playing ? visemes : null };
      void emitTo(PET_LABEL, PET_AUDIO_EVENT, frame).catch(() => {});
    });

    // Sentence by sentence while the voice reads a reply: the bubble and the face follow it.
    const stopSentences = streamingTts.onSentence((sentence, ms) => {
      if (!open) return;
      const text = bubbleText(sentence);
      if (!text) return;
      void api
        .classifyTextEmotion(sentence)
        .then((result) => result.vrm_expression || null)
        .catch(() => null)
        .then((expression) => emitTo(PET_LABEL, PET_SENTENCE_EVENT, { text, ms, expression } satisfies PetSentence))
        .catch(() => {});
    });

    // The pet's voice is quieter at night while it is open (its switch in the menu and the tab).
    audioPlayer.setGainAdjust(() => (open && loadPetPrefs().quietAtNight && isNightHour(new Date().getHours()) ? NIGHT_VOLUME : 1));

    const unlisteners: Promise<() => void>[] = [
      listen<boolean>(PET_VISIBILITY_EVENT, (event) => {
        open = event.payload;
        if (open) send(true);
      }),
      listen(PET_READY_EVENT, () => {
        open = true;
        send(true);
      }),
      listen<string>(PET_PICK_EMOTION_EVENT, (event) => {
        useAppStore.getState().setCurrentEmotion(manualEmotion(event.payload));
      }),
      // The pet's quick chat: into the active chat, as if typed there; the reply comes back as bubble.
      listen<PetSay>(PET_SEND_EVENT, (event) => {
        useAppStore
          .getState()
          .sendMessage(event.payload.text)
          .catch((e: unknown) => {
            const text = translate('pet.sendFailed', { error: errorMessage(e) });
            void emitTo(PET_LABEL, PET_SAY_EVENT, { text } satisfies PetSay).catch(() => {});
          });
      }),
      // Tray menu and global shortcut.
      listen(PET_TOGGLE_EVENT, () => {
        void useAppStore.getState().toggleDesktopPet(!open);
      }),
    ];

    // Open at start when it was open before; after the settings, so the right model is known.
    let reopened = false;
    const reopen = () => {
      if (reopened || !useAppStore.getState().settingsLoaded) return;
      reopened = true;
      if (loadPetOpen() && !open) void useAppStore.getState().toggleDesktopPet(true);
    };
    const stopReopen = useAppStore.subscribe((s) => {
      if (s.settingsLoaded) reopen();
    });
    reopen();
    // A pet that was open before this window (re)loaded reports back.
    void Promise.all(unlisteners).then(() => {
      if (isSubscribed) void emitTo(PET_LABEL, PET_HELLO_EVENT).catch(() => {});
    });

    return () => {
      isSubscribed = false;
      unsubscribeStore();
      stopReopen();
      stopSentences();
      stopFrames();
      audioPlayer.setGainAdjust(() => 1);
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
    };
  }, [enabled]);
}
