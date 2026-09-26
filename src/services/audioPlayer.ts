export type AudioPlaybackState = 'idle' | 'loading' | 'playing';

interface QueuedAudio {
  dataUrl: string;
  gain: number;
  outputDeviceId: string;
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
  private sourceNode: AudioBufferSourceNode | null = null;
  private queue: QueuedAudio[] = [];
  private processing = false;
  private playing = false;
  private generation = 0;
  private state: AudioPlaybackState = 'idle';

  private readonly onFrameCallbacks = new Set<(amplitude: number) => void>();
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

  private async initAudioContext(outputDeviceId: string) {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio wird von diesem System nicht unterstützt.');

      this.audioContext = new AudioContextClass() as SinkAwareAudioContext;
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.gainNode = this.audioContext.createGain();
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    }
    if (outputDeviceId && this.audioContext.setSinkId) {
      await this.audioContext.setSinkId(outputDeviceId);
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public onAudioFrame(callback: (amplitude: number) => void) {
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
        this.onFrameCallbacks.forEach((callback) => callback(0));
        return;
      }
      this.analyser?.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      const amplitude = Math.min(1, sum / data.length / 128);
      this.onFrameCallbacks.forEach((callback) => callback(amplitude));
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
      const response = await fetch(next.dataUrl);
      const encodedAudio = await response.arrayBuffer();
      if (!this.audioContext || currentGeneration !== this.generation) return;
      const buffer = await this.audioContext.decodeAudioData(encodedAudio);
      if (currentGeneration !== this.generation) return;

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analyser ?? this.audioContext.destination);
      if (this.gainNode) this.gainNode.gain.value = next.gain;
      this.sourceNode = source;
      this.playing = true;
      this.processing = false;
      this.setState('playing');
      source.onended = () => {
        if (this.sourceNode !== source || currentGeneration !== this.generation) return;
        source.disconnect();
        this.sourceNode = null;
        this.playing = false;
        void this.processQueue();
      };
      source.start();
      this.startAnalyserLoop();
    } catch (error) {
      console.error('Audio-Wiedergabe fehlgeschlagen:', error);
      this.processing = false;
      this.playing = false;
      if (currentGeneration === this.generation) void this.processQueue();
    }
  }

  public async playDataUrl(dataUrl: string, gain = 1, outputDeviceId = '') {
    this.stop();
    this.enqueue(dataUrl, gain, outputDeviceId);
  }

  public enqueue(dataUrl: string, gain = 1, outputDeviceId = '') {
    this.queue.push({ dataUrl, gain, outputDeviceId });
    void this.processQueue();
  }

  public stop() {
    this.generation += 1;
    this.queue = [];
    this.processing = false;
    if (this.sourceNode) {
      const source = this.sourceNode;
      this.sourceNode = null;
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.playing = false;
    this.onFrameCallbacks.forEach((callback) => callback(0));
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
