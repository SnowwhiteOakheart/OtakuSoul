export class AudioPlaybackManager {
  private static instance: AudioPlaybackManager;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;

  private queue: string[] = [];
  private isProcessingQueue = false;

  private onFrameCallbacks: Set<(amplitude: number) => void> = new Set();
  private animationFrameId: number | null = null;

  private playing = false;

  private constructor() {
    // initialize on demand due to browser autoplay policies
  }

  public static getInstance(): AudioPlaybackManager {
    if (!AudioPlaybackManager.instance) {
      AudioPlaybackManager.instance = new AudioPlaybackManager();
    }
    return AudioPlaybackManager.instance;
  }

  private async initAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
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

  private startAnalyserLoop() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const loop = () => {
      if (!this.playing) {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.onFrameCallbacks.forEach(cb => cb(0));
        return;
      }

      this.analyser!.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const amplitude = Math.min(1.0, average / 128.0); // Normalize to 0.0 - 1.0 approx

      this.onFrameCallbacks.forEach(cb => cb(amplitude));

      this.animationFrameId = requestAnimationFrame(loop);
    };

    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    loop();
  }

  public async playDataUrl(dataUrl: string) {
    await this.initAudioContext();
    this.stop(); // Stop any existing playback

    try {
      const response = await fetch(dataUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      if (!this.audioContext) return;
      this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.currentBuffer;
      
      if (this.analyser) {
        this.sourceNode.connect(this.analyser);
      } else {
        this.sourceNode.connect(this.audioContext.destination);
      }

      this.playing = true;
      this.sourceNode.onended = () => {
        this.playing = false;
        this.processQueue();
      };

      this.sourceNode.start(0);
      this.startAnalyserLoop();
    } catch (e) {
      console.error('Error playing audio:', e);
      this.playing = false;
      this.processQueue();
    }
  }

  public enqueue(dataUrl: string) {
    this.queue.push(dataUrl);
    if (!this.isProcessingQueue && !this.playing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }
    
    this.isProcessingQueue = true;
    const nextUrl = this.queue.shift()!;
    await this.playDataUrl(nextUrl);
  }

  public stop() {
    this.queue = [];
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.playing = false;
    this.isProcessingQueue = false;
  }

  public isPlaying(): boolean {
    return this.playing;
  }
}

export const audioPlayer = AudioPlaybackManager.getInstance();
