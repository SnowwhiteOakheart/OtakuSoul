import { VoiceConfig } from '../types';
import { api } from './api';
import { audioPlayer, gainFromVoiceVolume } from './audioPlayer';

const SENTENCE_END = /[.!?…]+[”"')\]]*(?:\s+|$)/g;

/**
 * Converts completed sentences while an LLM response is still streaming.
 * Synthesis stays serialized so audio is always queued in textual order.
 */
export class StreamingTtsManager {
  private buffer = '';
  private receivedText = false;
  private active = false;
  private session = 0;
  private config: VoiceConfig | null = null;
  private synthesisChain: Promise<void> = Promise.resolve();

  public begin(config: VoiceConfig) {
    this.cancel(false);
    this.active = true;
    this.config = config;
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
      completedUntil = match.index + match[0].length;
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
        const audioUrl = await api.synthesizeSpeech(text, config);
        if (session !== this.session || !this.active) return;
        audioPlayer.enqueue(
          audioUrl,
          gainFromVoiceVolume(config.volume),
          config.output_device_id,
        );
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
    this.synthesisChain = Promise.resolve();
    if (stopPlayback) audioPlayer.stop();
  }
}

export const streamingTts = new StreamingTtsManager();
