import { translate } from '../i18n';
export interface VoiceCaptureResult {
  audioBase64: string;
  durationMs: number;
  peakLevel: number;
}

export interface VoiceCaptureOptions {
  inputDeviceId?: string;
  vadThreshold?: number;
  silenceMs?: number;
  autoStopOnSilence?: boolean;
  maxDurationMs?: number;
  onLevel?: (level: number, speechDetected: boolean) => void;
  onAutoStop?: (result: VoiceCaptureResult | null) => void;
}

function resampleMono(input: Float32Array, sourceRate: number, targetRate = 16_000) {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left]! * (1 - fraction) + input[right]! * fraction;
  }
  return output;
}

function floatSamplesToBase64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export class VoiceCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private sourceRate = 48_000;
  private startedAt = 0;
  private lastSpeechAt = 0;
  private speechDetected = false;
  private peakLevel = 0;
  private active = false;
  private options: VoiceCaptureOptions = {};

  public async start(options: VoiceCaptureOptions = {}) {
    if (this.active) throw new Error(translate('errors.recordingActive'));
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(translate('errors.micUnsupported'));
    }

    this.options = options;
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (options.inputDeviceId) {
      audioConstraints.deviceId = { exact: options.inputDeviceId };
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    this.context = new AudioContext();
    await this.context.resume();
    this.sourceRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);

    this.chunks = [];
    this.startedAt = performance.now();
    this.lastSpeechAt = this.startedAt;
    this.speechDetected = false;
    this.peakLevel = 0;
    this.active = true;
    this.processor.onaudioprocess = (event) => this.handleAudio(event);
  }

  private handleAudio(event: AudioProcessingEvent) {
    if (!this.active) return;
    const samples = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(samples);
    this.chunks.push(copy);

    let energy = 0;
    for (const sample of copy) energy += sample * sample;
    const level = Math.sqrt(energy / copy.length);
    this.peakLevel = Math.max(this.peakLevel, level);
    const now = performance.now();
    const threshold = this.options.vadThreshold ?? 0.025;
    if (level >= threshold) {
      this.speechDetected = true;
      this.lastSpeechAt = now;
    }
    this.options.onLevel?.(Math.min(1, level / Math.max(threshold * 4, 0.01)), this.speechDetected);

    const reachedSilence = this.speechDetected &&
      now - this.lastSpeechAt >= (this.options.silenceMs ?? 900);
    const reachedLimit = now - this.startedAt >= (this.options.maxDurationMs ?? 60_000);
    if ((this.options.autoStopOnSilence && reachedSilence) || reachedLimit) {
      const callback = this.options.onAutoStop;
      void this.stop().then((result) => callback?.(result));
    }
  }

  public async stop(): Promise<VoiceCaptureResult | null> {
    if (!this.active) return null;
    this.active = false;
    const durationMs = performance.now() - this.startedAt;

    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();

    const sampleCount = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
    const merged = new Float32Array(sampleCount);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const samples = resampleMono(merged, this.sourceRate);
    this.cleanup();

    if (!this.speechDetected || samples.length < 1_600) return null;
    return {
      audioBase64: floatSamplesToBase64(samples),
      durationMs,
      peakLevel: this.peakLevel,
    };
  }

  public async cancel() {
    if (!this.active) return;
    this.speechDetected = false;
    await this.stop();
  }

  public isActive() {
    return this.active;
  }

  private cleanup() {
    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.silentGain = null;
    this.chunks = [];
  }
}
