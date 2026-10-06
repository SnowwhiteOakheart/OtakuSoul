import type { VoiceEffects } from '../types';

/** Effect values of each preset; the UI fills the sliders with them. */
export const VOICE_EFFECT_PRESETS: Record<string, Omit<VoiceEffects, 'preset'>> = {
  robot: { pitch_semitones: -1, reverb: 0.1, echo: 0, robot: 0.85, highpass_hz: 250, lowpass_hz: 0 },
  radio: { pitch_semitones: 0, reverb: 0, echo: 0, robot: 0, highpass_hz: 500, lowpass_hz: 3200 },
  ghost: { pitch_semitones: -2, reverb: 0.65, echo: 0.3, robot: 0, highpass_hz: 0, lowpass_hz: 6000 },
  cave: { pitch_semitones: 0, reverb: 0.45, echo: 0.45, robot: 0, highpass_hz: 0, lowpass_hz: 0 },
  deep: { pitch_semitones: -4, reverb: 0.1, echo: 0, robot: 0, highpass_hz: 0, lowpass_hz: 0 },
  fairy: { pitch_semitones: 5, reverb: 0.3, echo: 0.15, robot: 0, highpass_hz: 0, lowpass_hz: 0 },
};

export const NO_EFFECTS: VoiceEffects = {
  preset: '', pitch_semitones: 0, reverb: 0, echo: 0, robot: 0, highpass_hz: 0, lowpass_hz: 0,
};

export const hasEffects = (effects: VoiceEffects | null | undefined): effects is VoiceEffects =>
  !!effects &&
  (Math.abs(effects.pitch_semitones) >= 0.1 ||
    effects.reverb > 0.01 ||
    effects.echo > 0.01 ||
    effects.robot > 0.01 ||
    effects.highpass_hz > 0 ||
    effects.lowpass_hz > 0);

/**
 * Time-stretch by `factor` (output = input × factor long) with WSOLA: overlapping windows,
 * each placed where it fits the previous one best, so the pitch stays and there are few
 * clicks.
 */
export function timeStretch(input: Float32Array, factor: number, sampleRate: number): Float32Array {
  const frame = Math.round(sampleRate * 0.04);
  const hop = Math.round(frame / 2);
  const search = Math.round(sampleRate * 0.012);
  const outLength = Math.round(input.length * factor);
  const output = new Float32Array(outLength + frame);
  const weight = new Float32Array(outLength + frame);
  const window = new Float32Array(frame).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1)));
  let previous = 0;
  for (let outPos = 0; outPos < outLength; outPos += hop) {
    const nominal = Math.round(outPos / factor);
    let best = Math.min(Math.max(nominal, 0), Math.max(0, input.length - frame));
    if (outPos > 0) {
      // Continue naturally from the previous frame: best match of its natural successor.
      const target = previous + hop;
      let bestScore = -Infinity;
      const from = Math.max(0, nominal - search);
      const to = Math.min(input.length - frame, nominal + search);
      for (let candidate = from; candidate <= to; candidate += 2) {
        let score = 0;
        for (let i = 0; i < hop; i += 4) score += (input[candidate + i] ?? 0) * (input[target + i] ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    for (let i = 0; i < frame; i += 1) {
      const sample = input[best + i] ?? 0;
      output[outPos + i]! += sample * window[i]!;
      weight[outPos + i]! += window[i]!;
    }
    previous = best;
  }
  for (let i = 0; i < outLength; i += 1) if (weight[i]! > 1e-3) output[i]! /= weight[i]!;
  return output.subarray(0, outLength);
}

/** Pitch shift without a tempo change: stretch, then resample back to the original length. */
export function pitchShift(input: Float32Array, semitones: number, sampleRate: number): Float32Array {
  const ratio = 2 ** (semitones / 12);
  const stretched = timeStretch(input, ratio, sampleRate);
  const output = new Float32Array(input.length);
  for (let i = 0; i < output.length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    output[i] = (stretched[index] ?? 0) * (1 - fraction) + (stretched[index + 1] ?? 0) * fraction;
  }
  return output;
}

/** A decaying noise burst as the room for the reverb. */
const roomImpulse = (context: BaseAudioContext, seconds: number) => {
  const length = Math.round(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
  }
  return impulse;
};

/** 16-bit mono WAV as a data URL (what the player and lip sync already understand). */
export function encodeWav(samples: Float32Array, sampleRate: number): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Renders the voice with its effects (filters, robot, reverb, echo, pitch) into a new WAV
 * data URL. Without effects the clip comes back unchanged.
 */
export async function applyVoiceEffects(dataUrl: string, effects: VoiceEffects | null | undefined): Promise<string> {
  if (!hasEffects(effects)) return dataUrl;
  const encoded = await (await fetch(dataUrl)).arrayBuffer();
  const decoder = new OfflineAudioContext(1, 1, 44_100);
  const decoded = await decoder.decodeAudioData(encoded);
  const sampleRate = decoded.sampleRate;
  let samples: Float32Array = decoded.getChannelData(0);
  if (Math.abs(effects.pitch_semitones) >= 0.1) {
    samples = pitchShift(samples, Math.max(-12, Math.min(12, effects.pitch_semitones)), sampleRate);
  }

  const tail = effects.reverb > 0.01 ? 1.6 : effects.echo > 0.01 ? 1.2 : 0;
  const context = new OfflineAudioContext(1, samples.length + Math.round(tail * sampleRate), sampleRate);
  const source = context.createBufferSource();
  const input = context.createBuffer(1, samples.length, sampleRate);
  input.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  source.buffer = input;

  let chain: AudioNode = source;
  const filter = (type: BiquadFilterType, frequency: number) => {
    const node = context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    chain.connect(node);
    chain = node;
  };
  if (effects.highpass_hz > 0) filter('highpass', effects.highpass_hz);
  if (effects.lowpass_hz > 0) filter('lowpass', effects.lowpass_hz);
  if (effects.robot > 0.01) {
    // Ring modulation: the voice times a low sine gives the metallic robot sound.
    const ring = context.createGain();
    ring.gain.value = 0;
    const carrier = context.createOscillator();
    carrier.frequency.value = 55;
    carrier.connect(ring.gain);
    carrier.start();
    const dry = context.createGain();
    dry.gain.value = 1 - effects.robot;
    const mixed = context.createGain();
    chain.connect(ring);
    chain.connect(dry);
    ring.connect(mixed);
    dry.connect(mixed);
    chain = mixed;
  }

  const output = context.createGain();
  output.gain.value = 1;
  chain.connect(output);
  if (effects.reverb > 0.01) {
    const convolver = context.createConvolver();
    convolver.buffer = roomImpulse(context, 1.5);
    const wet = context.createGain();
    wet.gain.value = effects.reverb * 0.6;
    chain.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);
  }
  if (effects.echo > 0.01) {
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = context.createGain();
    feedback.gain.value = Math.min(0.7, effects.echo * 0.6);
    const wet = context.createGain();
    wet.gain.value = effects.echo * 0.5;
    chain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(output);
  }
  output.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return encodeWav(rendered.getChannelData(0), sampleRate);
}
