import { useEffect } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { audioPlayer } from '../services/audioPlayer';
import { streamingTts } from '../services/streamingTts';
import { api } from '../services/api';
import { manualEmotion, resolveVrmPath } from '../components/avatars/avatarMatch';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import {
  PET_AUDIO_EVENT,
  PET_HELLO_EVENT,
  PET_LABEL,
  PET_MOTIONS_EVENT,
  PET_PICK_EMOTION_EVENT,
  PET_READY_EVENT,
  PET_REMARK_EVENT,
  PET_SAY_EVENT,
  PET_SEND_EVENT,
  PET_SENTENCE_EVENT,
  PET_STATE_EVENT,
  PET_TOGGLE_EVENT,
  PET_VISIBILITY_EVENT,
  isPet3dModel,
  forgetLegacyPetOpen,
  loadPetPrefs,
  type PetAudioFrame,
  type PetRemark,
  type PetSay,
  type PetSentence,
  type PetState,
} from '../services/desktopPet';
import { bubbleText } from '../components/companion/petBehavior';
import { watchNewReplies } from './replyWatcher';
import { translate } from '../i18n';
import { isNightHour, NIGHT_VOLUME } from '../utils/dayTime';
import { errorMessage } from '../utils/errors';
import { llmTarget } from '../store/helpers';
import { languageCode, localizeCard } from '../utils/cardI18n';

/** Voice frames to the pet at most this often (mouth shapes are smoothed there). */
const AUDIO_FRAME_MS = 33;

type StoreState = ReturnType<typeof useAppStore.getState>;

/**
 * The figure's model for the pet (also the Desktop-Pet tab's preview): only a real 3D model
 * (VRM, glTF, MMD). Live2D, Inochi2D and portraits stay in the chat; without a 3D
 * model the pet shows a note instead of a figure.
 */
export function petModels(
  s: Pick<StoreState, 'activeCharacter' | 'scannedVrms' | 'activeVrmPath'>,
): Pick<PetState, 'modelPath'> {
  const vrmPath = resolveVrmPath(s.activeCharacter, s.scannedVrms, s.activeVrmPath);
  return { modelPath: isPet3dModel(vrmPath) ? vrmPath : '' };
}

function petState(s: StoreState): PetState {
  return {
    characterName: s.activeCharacter?.card.data.name || APP_DEFAULT_COMPANION_NAME,
    characterId: s.activeCharacter?.id ?? '',
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
    const send = (force = false) => {
      if (!open) return;
      const state = petState(useAppStore.getState());
      // A gesture plays once: a freshly opened pet does not repeat the one from before.
      if (force) staleGestureId = state.gesture?.id ?? null;
      const payload: PetState = { ...state, gesture: state.gesture?.id === staleGestureId ? null : state.gesture };
      const key = JSON.stringify(payload);
      if (!force && key === lastSent) return;
      lastSent = key;
      void emitTo(PET_LABEL, PET_STATE_EVENT, payload).catch(() => {});
    };

    const stopReplies = watchNewReplies((text) => {
      if (open) void emitTo(PET_LABEL, PET_SAY_EVENT, { text } satisfies PetSay).catch(() => {});
    });

    const unsubscribeStore = useAppStore.subscribe((s, prev) => {
      if (
        s.activeCharacter !== prev.activeCharacter ||
        s.scannedVrms !== prev.scannedVrms ||
        s.activeVrmPath !== prev.activeVrmPath ||
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
      // Motions loaded from the pet's menu: read them again (the pet gets them with the next state).
      // What happened to the pet (thrown, landed, woken, sat): one short line of the character.
      listen<PetRemark>(PET_REMARK_EVENT, (event) => {
        const state = useAppStore.getState();
        const char = state.activeCharacter;
        if (!open || !char || state.isGenerating) return;
        void state
          .ensureLocalAi()
          .then(() => {
            const s = useAppStore.getState();
            return api.petRemark({
              event: event.payload.event,
              detail: event.payload.detail ?? null,
              char_name: localizeCard(char.card.data, languageCode(s.replyLanguage)).name || char.card.data.name,
              char_description: char.card.data.description ?? '',
              user_name: s.activePersona.name,
              language: s.replyLanguage,
              ...llmTarget(s),
            });
          })
          .then((text) => {
            if (open && text) void emitTo(PET_LABEL, PET_SAY_EVENT, { text } satisfies PetSay).catch(() => {});
          })
          .catch(() => {});
      }),
      listen(PET_MOTIONS_EVENT, () => {
        void useAppStore.getState().refreshAvatarMotions();
      }),
      // Tray menu and global shortcut.
      listen(PET_TOGGLE_EVENT, () => {
        void useAppStore.getState().toggleDesktopPet(!open);
      }),
    ];

    // Open at start only when the user switched "open at start" on; after the settings, so the
    // right model is known.
    let reopened = false;
    forgetLegacyPetOpen();
    const reopen = () => {
      if (reopened || !useAppStore.getState().settingsLoaded) return;
      reopened = true;
      if (loadPetPrefs().openAtStart && !open) void useAppStore.getState().toggleDesktopPet(true);
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
      stopReplies();
      stopReopen();
      stopSentences();
      stopFrames();
      audioPlayer.setGainAdjust(() => 1);
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
    };
  }, [enabled]);
}
