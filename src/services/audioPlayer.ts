import { translate } from '../i18n';
import { applyVoiceEffects } from './voiceEffects';
import { estimateVisemes, SILENT_VISEMES, type Visemes } from './lipSync';
import type { VoiceEffects } from '../types';
export type AudioPlaybackState = 'idle' | 'loading' | 'playing';

interface QueuedAudio {
  dataUrl: string;
  gain: number;
  outputDeviceId: string;
  effects?: VoiceEffects | null;
}

type SinkAwareAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function gainFromVoiceVolume(volume: string): number {
  const percent = Number.parseInt(volume.replace('%', ''), 10);
  if (!Number.isFinite(percent)) return 1;
  return Math.min(2, Math.max(0, 1 + percent / 100));
}

export class AudioPlaybackManager {
  private static instance: AudioPlaybackManager;

  private audioContext: SinkAwareAudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  private queue: QueuedAudio[] = [];
  private processing = false;
  private playing = false;
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

  private audioElement: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;

  private async initAudioContext(outputDeviceId: string) {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error(translate('errors.webAudioUnsupported'));

      this.audioContext = new AudioContextClass() as SinkAwareAudioContext;
      this.analyser = this.audioContext.createAnalyser();
      // Fine enough (~47 Hz per bin) to find the vowel formants for the mouth shapes.
      this.analyser.fftSize = 1024;
      this.gainNode = this.audioContext.createGain();
      
      this.audioElement = new Audio();
      this.audioElement.crossOrigin = 'anonymous';
      this.mediaSource = this.audioContext.createMediaElementSource(this.audioElement);
      
      this.mediaSource.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    }
    if (outputDeviceId && this.audioContext.setSinkId) {
      try {
        await this.audioContext.setSinkId(outputDeviceId);
      } catch (e) {
        console.warn('Audio-Gerät konnte nicht gesetzt werden:', e);
      }
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
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

  private async processQueue() {
    if (this.processing || this.playing) return;
    const next = this.queue.shift();
    if (!next) {
      this.setState('idle');
      return;
    }

    this.processing = true;
    this.setState('loading');
    const currentGeneration = this.generation;
    try {
      await this.initAudioContext(next.outputDeviceId);
      // Effects are rendered into the clip, so lip sync follows what is heard.
      const url = await applyVoiceEffects(next.dataUrl, next.effects).catch((error: unknown) => {
        console.warn('Stimmeffekte nicht angewendet:', error);
        return next.dataUrl;
      });
      if (!this.audioElement || currentGeneration !== this.generation) return;

      this.audioElement.src = url;
      if (this.gainNode) this.gainNode.gain.value = next.gain;

      this.audioElement.onended = () => {
        if (currentGeneration !== this.generation) return;
        this.playing = false;
        void this.processQueue();
      };
      
      this.audioElement.onerror = () => {
        if (currentGeneration !== this.generation) return;
        console.error('Audio-Wiedergabefehler:', this.audioElement?.error);
        this.playing = false;
        void this.processQueue();
      };

      await this.audioElement.play();
      this.playing = true;
      this.processing = false;
      this.setState('playing');
      this.startAnalyserLoop();
    } catch (error) {
      console.error('Audio-Wiedergabe fehlgeschlagen:', error);
      this.processing = false;
      this.playing = false;
      if (currentGeneration === this.generation) void this.processQueue();
    }
  }

  public async playDataUrl(dataUrl: string, gain = 1, outputDeviceId = '', effects?: VoiceEffects | null) {
    this.stop();
    this.enqueue(dataUrl, gain, outputDeviceId, effects);
  }

  public enqueue(dataUrl: string, gain = 1, outputDeviceId = '', effects?: VoiceEffects | null) {
    this.queue.push({ dataUrl, gain, outputDeviceId, effects });
    void this.processQueue();
  }

  public stop() {
    this.generation += 1;
    this.queue = [];
    this.processing = false;
    
    if (this.audioElement) {
      this.audioElement.onended = null;
      this.audioElement.onerror = null;
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.playing = false;
    this.onFrameCallbacks.forEach((callback) => callback(0, SILENT_VISEMES));
    this.setState('idle');
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public isBusy(): boolean {
    return this.playing || this.processing || this.queue.length > 0;
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
