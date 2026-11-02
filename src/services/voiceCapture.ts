import { translate } from '../i18n';
import { api } from './api';
export interface VoiceCaptureResult {
  audioBase64: string;
  durationMs: number;
  peakLevel: number;
}

export interface VoiceCaptureOptions {
  inputDeviceId?: string;
  /** Sample rate of the result (16 kHz for speech recognition, 24 kHz for voice references). */
  targetRate?: number;
  vadThreshold?: number;
  silenceMs?: number;
  autoStopOnSilence?: boolean;
  maxDurationMs?: number;
  onLevel?: (level: number, speechDetected: boolean) => void;
  onAutoStop?: (result: VoiceCaptureResult | null) => void;
  /**
   * Starts "listening along" while the character speaks: the recording only counts once the
   * voice stays above `vadThreshold × thresholdFactor` for `minSpeechMs` (her own voice from
   * the speakers is quieter after echo cancellation). Then `onBargeIn` runs and it records like
   * normal, keeping the last `preRollMs` before that so the first words are not lost.
   * `disarm()` switches to normal listening without waiting.
   */
  bargeIn?: BargeInOptions;
  /**
   * Also ask Silero VAD whether a sound is speech (typing, breathing and noise are not). Only
   * when it agrees does a loud sound count; while the model loads or is missing, the level
   * alone decides as before.
   */
  speechModel?: boolean;
}

/** Silero's verdict from at least this probability on counts as speech. */
export const SPEECH_PROBABILITY = 0.5;
/** A verdict older than this (ms) no longer counts – the level decides alone again. */
const VERDICT_MAX_AGE_MS = 600;

export interface BargeInOptions {
  thresholdFactor: number;
  minSpeechMs: number;
  preRollMs: number;
  onBargeIn: () => void;
}

/** Defaults for the voice call: clearly louder than the threshold, for about a third of a second. */
export const BARGE_IN_DEFAULTS = { thresholdFactor: 2.5, minSpeechMs: 300, preRollMs: 600 } as const;

export function resampleMono(input: Float32Array, sourceRate: number, targetRate = 16_000) {
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

export function floatSamplesToBase64(samples: Float32Array) {
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
  /** Listening along (barge-in) and not triggered yet. */
  private armed = false;
  /** How long the voice has been above the barge-in threshold (ms, decays in pauses). */
  private loudMs = 0;
  /** Silero for this recording (`null` while off, loading or missing). */
  private vadStream: string | null = null;
  private vadReady = false;
  private speechProbability = 0;
  private verdictAt = 0;

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
    this.armed = Boolean(options.bargeIn);
    this.loudMs = 0;
    this.active = true;
    this.vadReady = false;
    this.verdictAt = 0;
    this.processor.onaudioprocess = (event) => this.handleAudio(event);
    if (options.speechModel) this.openSpeechModel();
  }

  /** Starts Silero in the background; until it answers the level decides. */
  private openSpeechModel() {
    const stream = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.vadStream = stream;
    api
      .vadOpen(stream)
      .then(() => {
        if (this.vadStream === stream && this.active) this.vadReady = true;
        else void api.vadClose(stream).catch(() => {});
      })
      .catch((error: unknown) => {
        console.warn('Speech model unavailable, deciding by level:', error);
        if (this.vadStream === stream) this.vadStream = null;
      });
  }

  /** Sends a chunk to Silero; its verdict arrives a moment later and counts for the next chunks. */
  private askSpeechModel(samples: Float32Array) {
    const stream = this.vadStream;
    if (!stream || !this.vadReady) return;
    const audio = Array.from(resampleMono(samples, this.sourceRate, 16_000));
    api
      .vadProcess(stream, audio)
      .then((probability) => {
        if (probability === null || probability === undefined || this.vadStream !== stream) return;
        this.speechProbability = probability;
        this.verdictAt = performance.now();
      })
      .catch(() => {
        // One failed block: the level decides until the next verdict.
      });
  }

  /** Whether a sound at this level is speech: loud enough and (with Silero) really a voice. */
  public sounds(level: number, threshold: number, now = performance.now()) {
    if (level < threshold) return false;
    if (!this.vadReady || now - this.verdictAt > VERDICT_MAX_AGE_MS) return true;
    return this.speechProbability >= SPEECH_PROBABILITY;
  }

  private closeSpeechModel() {
    const stream = this.vadStream;
    this.vadStream = null;
    this.vadReady = false;
    if (stream) void api.vadClose(stream).catch(() => {});
  }

  private handleAudio(event: AudioProcessingEvent) {
    if (!this.active) return;
    const samples = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(samples);
    this.chunks.push(copy);

    let energy = 0;
    for (const sample of copy) energy += sample * sample;
    const level = Math.sqrt(energy / copy.length);
    const now = performance.now();
    this.askSpeechModel(copy);
    const threshold = this.options.vadThreshold ?? 0.025;
    const bargeIn = this.options.bargeIn;
    if (this.armed && bargeIn) {
      this.listenAlong(level, threshold, bargeIn, (copy.length / this.sourceRate) * 1000, now);
      return;
    }
    this.peakLevel = Math.max(this.peakLevel, level);
    if (this.sounds(level, threshold, now)) {
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

  /** Barge-in watch: keeps only a short lead-in until the user clearly speaks. */
  private listenAlong(level: number, threshold: number, bargeIn: BargeInOptions, frameMs: number, now: number) {
    const keep = Math.max(1, Math.ceil(bargeIn.preRollMs / frameMs));
    if (this.chunks.length > keep) this.chunks.splice(0, this.chunks.length - keep);
    // Silero also hears the character's own voice from the speakers as speech, so the higher
    // level threshold stays; it only keeps typing and noise from cutting her off.
    const loud = this.sounds(level, threshold * bargeIn.thresholdFactor, now);
    this.loudMs = loud ? this.loudMs + frameMs : Math.max(0, this.loudMs - frameMs);
    this.options.onLevel?.(Math.min(1, level / Math.max(threshold * 4, 0.01)), false);
    if (this.loudMs < bargeIn.minSpeechMs) return;
    this.armed = false;
    this.startedAt = now;
    this.speechDetected = true;
    this.lastSpeechAt = now;
    this.peakLevel = Math.max(this.peakLevel, level);
    bargeIn.onBargeIn();
  }

  /** Stops listening along: from now on it records like a normal turn (fresh, without the lead-in). */
  public disarm() {
    if (!this.active || !this.armed) return;
    this.armed = false;
    this.chunks = [];
    this.startedAt = performance.now();
    this.lastSpeechAt = this.startedAt;
    this.speechDetected = false;
    this.peakLevel = 0;
  }

  /** Whether it is still listening along without having been triggered. */
  public isArmed() {
    return this.active && this.armed;
  }

  public async stop(): Promise<VoiceCaptureResult | null> {
    if (!this.active) return null;
    this.active = false;
    this.closeSpeechModel();
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
    const samples = resampleMono(merged, this.sourceRate, this.options.targetRate ?? 16_000);
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
    this.armed = false;
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
