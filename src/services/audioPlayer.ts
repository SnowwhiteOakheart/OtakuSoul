import { translate } from '../i18n';
import { applyVoiceEffects } from './voiceEffects';
import { estimateVisemes, SILENT_VISEMES, type Visemes } from './lipSync';
import { audibleRange } from '../utils/audioTrim';
import type { VoiceEffects } from '../types';
export type AudioPlaybackState = 'idle' | 'loading' | 'playing';

interface QueuedAudio {
  dataUrl: string;
  gain: number;
  outputDeviceId: string;
  effects?: VoiceEffects | null;
  onScheduled?: ClipScheduled;
}

/** Called with a clip's start and end on the audio clock (`audioPlayer.now()`), once it is scheduled. */
export type ClipScheduled = (start: number, end: number) => void;

type SinkAwareAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

/** The pause between two clips (sentences, or a character's line and the narrator's action). */
export const SENTENCE_GAP_SECONDS = 0.18;
/** A clip starts at least this far ahead, so the first samples are not cut off. */
const START_LEAD_SECONDS = 0.02;

export function gainFromVoiceVolume(volume: string): number {
  const percent = Number.parseInt(volume.replace('%', ''), 10);
  if (!Number.isFinite(percent)) return 1;
  return Math.min(2, Math.max(0, 1 + percent / 100));
}

/**
 * Plays speech clips one after another without the gaps of loading each clip only when the one
 * before has ended: the next clips are decoded while one plays, trimmed of the silence their
 * engine padded them with, and scheduled on the Web Audio clock to start right after the one
 * before (plus [`SENTENCE_GAP_SECONDS`]).
 */
export class AudioPlaybackManager {
  private static instance: AudioPlaybackManager;

  private audioContext: SinkAwareAudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sinkId = '';

  /** Clips waiting to be decoded, in order. */
  private pending: QueuedAudio[] = [];
  private preparing = false;
  /** Clips scheduled or playing. */
  private readonly sources = new Set<AudioBufferSourceNode>();
  /** Audio-clock time the next clip may start at. */
  private nextStart = 0;
  private playing = false;
  /** Voice playing in another window (desktop pet: the main window plays, the pet moves its mouth). */
  private remotePlaying = false;
  private generation = 0;
  private state: AudioPlaybackState = 'idle';

  private readonly onFrameCallbacks = new Set<(amplitude: number, visemes: Visemes) => void>();
  private readonly onStateCallbacks = new Set<(state: AudioPlaybackState) => void>();
  private animationFrameId: number | null = null;

  private constructor() {
    // AudioContext is initialized after a user gesture because of autoplay policies.
  }

  public static getInstance(): AudioPlaybackManager {
    if (!AudioPlaybackManager.instance) {
      AudioPlaybackManager.instance = new AudioPlaybackManager();
    }
    return AudioPlaybackManager.instance;
  }

  private setState(state: AudioPlaybackState) {
    if (this.state === state) return;
    this.state = state;
    this.onStateCallbacks.forEach((callback) => callback(state));
  }

  private async initAudioContext(outputDeviceId: string): Promise<SinkAwareAudioContext> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error(translate('errors.webAudioUnsupported'));

      this.audioContext = new AudioContextClass() as SinkAwareAudioContext;
      this.analyser = this.audioContext.createAnalyser();
      // Fine enough (~47 Hz per bin) to find the vowel formants for the mouth shapes.
      this.analyser.fftSize = 1024;
      // The analyser only listens (lip sync, before the volume); it has to be pulled by the
      // graph, so it ends in a silent node.
      const silent = this.audioContext.createGain();
      silent.gain.value = 0;
      this.analyser.connect(silent);
      silent.connect(this.audioContext.destination);
      this.sinkId = '';
    }
    // Switching the device takes a moment: only when it changes.
    if (outputDeviceId !== this.sinkId && this.audioContext.setSinkId) {
      try {
        await this.audioContext.setSinkId(outputDeviceId);
        this.sinkId = outputDeviceId;
      } catch (e) {
        console.warn('Audio-Gerät konnte nicht gesetzt werden:', e);
      }
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  public onAudioFrame(callback: (amplitude: number, visemes: Visemes) => void) {
    this.onFrameCallbacks.add(callback);
    return () => {
      this.onFrameCallbacks.delete(callback);
    };
  }

  public onPlaybackState(callback: (state: AudioPlaybackState) => void) {
    this.onStateCallbacks.add(callback);
    callback(this.state);
    return () => {
      this.onStateCallbacks.delete(callback);
    };
  }

  private startAnalyserLoop() {
    if (!this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);

    const loop = () => {
      if (!this.playing) {
        this.onFrameCallbacks.forEach((callback) => callback(0, SILENT_VISEMES));
        return;
      }
      this.analyser?.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      const amplitude = Math.min(1, sum / data.length / 128);
      const binHz = (this.audioContext?.sampleRate ?? 48_000) / (this.analyser?.fftSize ?? 1024);
      const visemes = estimateVisemes(data, binHz, amplitude);
      this.onFrameCallbacks.forEach((callback) => callback(amplitude, visemes));
      this.animationFrameId = requestAnimationFrame(loop);
    };

    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    loop();
  }

  /** The clip without the silence its engine padded it with. */
  private trimmed(context: AudioContext, buffer: AudioBuffer): AudioBuffer {
    const [start, end] = audibleRange(buffer.getChannelData(0), buffer.sampleRate);
    if (start === 0 && end === buffer.length) return buffer;
    const out = context.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      out.copyToChannel(buffer.getChannelData(channel).subarray(start, end), channel);
    }
    return out;
  }

  /** Starts `buffer` right after what is already scheduled. */
  private schedule(context: AudioContext, buffer: AudioBuffer, gain: number, onScheduled?: ClipScheduled) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const volume = context.createGain();
    volume.gain.value = gain;
    source.connect(volume);
    volume.connect(context.destination);
    if (this.analyser) source.connect(this.analyser);

    const start = Math.max(context.currentTime + START_LEAD_SECONDS, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration + SENTENCE_GAP_SECONDS;
    onScheduled?.(start, start + buffer.duration);
    this.sources.add(source);
    const generation = this.generation;
    source.onended = () => {
      this.sources.delete(source);
      volume.disconnect();
      if (generation !== this.generation) return;
      if (this.sources.size === 0 && this.pending.length === 0 && !this.preparing) {
        this.playing = false;
        this.setState('idle');
      }
    };
    if (!this.playing) {
      this.playing = true;
      this.setState('playing');
      this.startAnalyserLoop();
    }
  }

  /** Decodes waiting clips in order and schedules each as soon as it is ready. */
  private async prepareQueue() {
    if (this.preparing) return;
    this.preparing = true;
    const generation = this.generation;
    try {
      while (this.pending.length > 0 && generation === this.generation) {
        const next = this.pending.shift()!;
        if (this.sources.size === 0) this.setState('loading');
        try {
          const context = await this.initAudioContext(next.outputDeviceId);
          // Effects are rendered into the clip, so lip sync follows what is heard.
          const url = await applyVoiceEffects(next.dataUrl, next.effects).catch((error: unknown) => {
            console.warn('Stimmeffekte nicht angewendet:', error);
            return next.dataUrl;
          });
          const encoded = await (await fetch(url)).arrayBuffer();
          const decoded = await context.decodeAudioData(encoded);
          if (generation !== this.generation) return;
          this.schedule(context, this.trimmed(context, decoded), next.gain, next.onScheduled);
        } catch (error) {
          console.error('Audio-Wiedergabe fehlgeschlagen:', error);
        }
      }
    } finally {
      this.preparing = false;
      if (this.pending.length > 0) {
        // Clips queued after a stop wait for this loop; take them up now.
        void this.prepareQueue();
      } else if (generation === this.generation && this.sources.size === 0) {
        this.playing = false;
        this.setState('idle');
      }
    }
  }

  public async playDataUrl(dataUrl: string, gain = 1, outputDeviceId = '', effects?: VoiceEffects | null) {
    this.stop();
    this.enqueue(dataUrl, gain, outputDeviceId, effects);
  }

  public enqueue(dataUrl: string, gain = 1, outputDeviceId = '', effects?: VoiceEffects | null, onScheduled?: ClipScheduled) {
    this.pending.push({ dataUrl, gain, outputDeviceId, effects, onScheduled });
    void this.prepareQueue();
  }

  public stop() {
    this.generation += 1;
    this.pending = [];
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Not started yet or already ended.
      }
    }
    this.sources.clear();
    this.nextStart = 0;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.playing = false;
    this.onFrameCallbacks.forEach((callback) => callback(0, SILENT_VISEMES));
    this.setState('idle');
  }

  /** The audio clock that scheduled clips refer to (0 before the first clip). */
  public now(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  public isPlaying(): boolean {
    return this.playing || this.remotePlaying;
  }

  /**
   * A frame of the voice another window plays (`visemes` null: it stopped). The avatar viewers
   * here then move the mouth as if this player played it.
   */
  public feedRemoteFrame(amplitude: number, visemes: Visemes | null) {
    this.remotePlaying = visemes !== null;
    const frame = visemes ?? SILENT_VISEMES;
    this.onFrameCallbacks.forEach((callback) => callback(visemes ? amplitude : 0, frame));
  }

  public isBusy(): boolean {
    return this.playing || this.preparing || this.pending.length > 0;
  }

  public waitForIdle(timeoutMs = 120_000): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        resolve();
      }, timeoutMs);
      const unsubscribe = this.onPlaybackState((state) => {
        if (state !== 'idle' || this.isBusy()) return;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });
  }
}

export const audioPlayer = AudioPlaybackManager.getInstance();
