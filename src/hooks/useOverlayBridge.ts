import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audioPlayer } from '../services/audioPlayer';
import { streamingTts } from '../services/streamingTts';
import { api } from '../services/api';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import { bubbleText } from '../components/companion/petBehavior';
import { watchNewReplies } from './replyWatcher';
import { followPortrait } from './portraitFeed';

/** The overlay's picture is at most this large (px); the page scales it to its own size. */
const PORTRAIT_PX = 512;
/** Voice levels to the overlay at most this often. */
const AUDIO_FRAME_MS = 50;

/**
 * Main window side of the streaming overlay (OBS browser source, `/overlay` of the web server):
 * tells the backend which figure is active, its mood, new replies, the sentence the voice reads
 * and the voice's level. The backend forwards it to the open overlay pages; while none is open
 * only the small state goes along.
 */
export function useOverlayBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    /** Open overlay pages (the backend's answer to the last push). */
    let pages = 0;
    let lastState = '';

    const push = (message: Record<string, unknown>) => {
      void api
        .overlayPush(message)
        .then((count) => {
          pages = count;
        })
        .catch(() => {});
    };

    const sendState = () => {
      const s = useAppStore.getState();
      const state: Record<string, unknown> = {
        type: 'state',
        characterName: s.activeCharacter?.card.data.name || APP_DEFAULT_COMPANION_NAME,
        emotion: s.currentEmotion.emotion,
        expression: s.currentEmotion.vrm_expression,
        thinking: s.isGenerating,
      };
      const key = JSON.stringify(state);
      if (key === lastState) return;
      lastState = key;
      push(state);
    };

    const stopStore = useAppStore.subscribe((s, prev) => {
      if (s.activeCharacter !== prev.activeCharacter || s.currentEmotion !== prev.currentEmotion || s.isGenerating !== prev.isGenerating) {
        sendState();
      }
    });
    // The picture goes along only when it changed (a data URL; the page cannot load asset URLs).
    const stopPortrait = followPortrait(PORTRAIT_PX, (portrait) => push({ type: 'state', portrait }));
    const stopReplies = watchNewReplies((text) => push({ type: 'say', text }));

    let lastFrameAt = 0;
    let voiced = false;
    const stopFrames = audioPlayer.onAudioFrame((amplitude) => {
      if (pages === 0) return;
      const playing = audioPlayer.isPlaying();
      const now = performance.now();
      // The last silent frame always goes, or the overlay's mouth would stay open.
      if (playing && now - lastFrameAt < AUDIO_FRAME_MS) return;
      if (!playing && !voiced) return;
      lastFrameAt = now;
      voiced = playing;
      push({ type: 'audio', amplitude: playing ? amplitude : 0 });
    });
    const stopSentences = streamingTts.onSentence((sentence, ms) => {
      const text = bubbleText(sentence);
      if (text) push({ type: 'sentence', text, ms });
    });

    // The first push also tells how many pages are open; a page that connects later gets the stored state.
    sendState();
    return () => {
      stopStore();
      stopPortrait();
      stopReplies();
      stopFrames();
      stopSentences();
    };
  }, [enabled]);
}
