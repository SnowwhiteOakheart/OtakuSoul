import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audioPlayer } from '../services/audioPlayer';
import { streamingTts } from '../services/streamingTts';
import { api } from '../services/api';
import { APP_DEFAULT_COMPANION_NAME } from '../constants/branding';
import { bubbleText } from '../components/companion/petBehavior';
import { watchNewReplies } from './replyWatcher';

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
    /** The portrait the backend has (a data URL, often MBs): it goes along only when it changed. */
    let sentPortrait: string | null = null;
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
      const portrait = s.activeCharacter?.avatar_data_url ?? '';
      const key = JSON.stringify(state) + (portrait === sentPortrait ? '' : '+portrait');
      if (key === lastState) return;
      lastState = key;
      if (portrait !== sentPortrait) {
        state.portrait = portrait;
        sentPortrait = portrait;
      }
      push(state);
    };

    const stopStore = useAppStore.subscribe((s, prev) => {
      if (s.activeCharacter !== prev.activeCharacter || s.currentEmotion !== prev.currentEmotion || s.isGenerating !== prev.isGenerating) {
        sendState();
      }
    });
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
      stopReplies();
      stopFrames();
      stopSentences();
    };
  }, [enabled]);
}
