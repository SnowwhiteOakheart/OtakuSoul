import { VoiceConfig } from '../types';
import { api } from './api';
import { audioPlayer, gainFromVoiceVolume } from './audioPlayer';
import { voiceParts } from './narratorVoice';

const SENTENCE_END = /[.!?…]+[”"')\]]*(?:\s+|$)/g;

function hasUnclosedAsteriskSpan(text: string) {
  let delimiters = 0;
  for (let index = 0; index < text.length;) {
    if (text[index] !== '*' || (index > 0 && text[index - 1] === '\\')) {
      index += 1;
      continue;
    }

    // A run such as **...** is one delimiter, just like *...*.
    delimiters += 1;
    while (text[index] === '*') index += 1;
  }
  return delimiters % 2 !== 0;
}

/**
 * Converts completed sentences while an LLM response is still streaming.
 * Synthesis stays serialized so audio is always queued in textual order.
 * Local speech shares the GPU with the chat model and runs slower than real time while that
 * still generates, so its audio is held back until the reply is complete and then plays
 * without gaps.
 */
export class StreamingTtsManager {
  private buffer = '';
  private receivedText = false;
  private active = false;
  private session = 0;
  private config: VoiceConfig | null = null;
  private synthesisChain: Promise<void> = Promise.resolve();
  /** The reply is complete; local speech no longer waits for it. */
  private done = false;
  private held: (() => void)[] = [];

  public begin(config: VoiceConfig) {
    this.cancel(false);
    this.active = true;
    this.config = config;
    this.done = false;
  }

  public push(token: string, config: VoiceConfig) {
    if (!this.active) this.begin(config);
    this.receivedText = true;
    this.buffer += token;
    this.queueCompletedSentences();
  }

  private queueCompletedSentences() {
    let completedUntil = 0;
    SENTENCE_END.lastIndex = 0;
    for (let match = SENTENCE_END.exec(this.buffer); match; match = SENTENCE_END.exec(this.buffer)) {
      const candidateEnd = match.index + match[0].length;
      // Do not send a partial *action with punctuation.* to the backend. The
      // closing asterisk may arrive in a later stream token and the incomplete
      // fragment would otherwise be spoken (including "Stern" by Edge-TTS).
      if (!hasUnclosedAsteriskSpan(this.buffer.slice(0, candidateEnd))) {
        completedUntil = candidateEnd;
      }
    }
    if (completedUntil === 0) return;

    const completed = this.buffer.slice(0, completedUntil).trim();
    this.buffer = this.buffer.slice(completedUntil);
    if (completed) this.queueSynthesis(completed);
  }

  private queueSynthesis(text: string) {
    const config = this.config;
    const session = this.session;
    if (!config || config.engine === 'disabled') return;
    this.synthesisChain = this.synthesisChain.then(async () => {
      try {
        // Actions may go to the narrator: each part with its own voice, in order.
        for (const part of await voiceParts(text, config)) {
          const audioUrl = await api.synthesizeSpeech(part.text, part.voice);
          if (session !== this.session || !this.active) return;
          const play = () =>
            audioPlayer.enqueue(
              audioUrl,
              gainFromVoiceVolume(part.voice.volume),
              part.voice.output_device_id,
              part.voice.effects,
            );
          // Local speech (character or narrator) waits until the reply is complete.
          if (!this.done && (config.engine === 'local' || part.voice.engine === 'local')) this.held.push(play);
          else if (this.held.length > 0) this.held.push(play);
          else play();
        }
      } catch (error) {
        console.error('Satzweises TTS fehlgeschlagen:', error);
      }
    });
  }

  public flush(fallbackFullText = '', config?: VoiceConfig) {
    if (!this.active && config) this.begin(config);
    if (!this.active || !this.config) return;
    const remainder = (this.receivedText ? this.buffer : fallbackFullText).trim();
    this.buffer = '';
    if (remainder) this.queueSynthesis(remainder);
    this.releaseHeld();
  }

  /** The reply is complete: play what was held back, later sentences play right away. */
  private releaseHeld() {
    this.done = true;
    const held = this.held;
    this.held = [];
    held.forEach((play) => play());
  }

  public async waitForIdle() {
    await this.synthesisChain;
    await audioPlayer.waitForIdle();
  }

  public cancel(stopPlayback = true) {
    this.session += 1;
    this.buffer = '';
    this.receivedText = false;
    this.active = false;
    this.config = null;
    this.done = false;
    this.held = [];
    this.synthesisChain = Promise.resolve();
    if (stopPlayback) audioPlayer.stop();
  }
}

export const streamingTts = new StreamingTtsManager();
