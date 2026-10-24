// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioPlayer, SENTENCE_GAP_SECONDS } from '../services/audioPlayer';

const RATE = 1000;
const started: number[] = [];
const lengths: number[] = [];

/** A clip of `seconds` with 0.4 s silence before and 0.5 s after the sound. */
function bufferFor(seconds: number) {
  const total = Math.round((0.4 + seconds + 0.5) * RATE);
  const data = new Float32Array(total);
  data.fill(0.3, 400, 400 + Math.round(seconds * RATE));
  return fakeBuffer(data);
}

function fakeBuffer(data: Float32Array) {
  return {
    sampleRate: RATE,
    numberOfChannels: 1,
    length: data.length,
    duration: data.length / RATE,
    getChannelData: () => data,
    copyToChannel(source: Float32Array) {
      data.set(source);
    },
  };
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  sampleRate = RATE;
  destination = {};
  createAnalyser() {
    return { fftSize: 0, frequencyBinCount: 4, connect: vi.fn(), getByteFrequencyData: vi.fn() };
  }
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }
  createBufferSource() {
    const source = {
      buffer: null as ReturnType<typeof fakeBuffer> | null,
      onended: null as null | (() => void),
      connect: vi.fn(),
      start(at: number) {
        started.push(at);
        lengths.push(source.buffer!.duration);
      },
      stop: vi.fn(),
    };
    return source;
  }
  createBuffer(_channels: number, length: number) {
    return fakeBuffer(new Float32Array(length));
  }
  async decodeAudioData(encoded: ArrayBuffer) {
    return bufferFor(new Uint8Array(encoded)[0]! / 10);
  }
  async resume() {}
}

beforeEach(() => {
  started.length = 0;
  lengths.length = 0;
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  // The first byte of each "file" is its sound length in tenths of a second.
  vi.stubGlobal('fetch', async (url: string) => ({
    arrayBuffer: async () => new Uint8Array([Number(url.split(',')[1])]).buffer,
  }));
});

afterEach(() => {
  audioPlayer.stop();
  vi.unstubAllGlobals();
});

describe('speech playback', () => {
  it('plays sentences back to back with a short, even pause', async () => {
    audioPlayer.enqueue('data:audio/wav;base64,20');
    audioPlayer.enqueue('data:audio/wav;base64,15');
    audioPlayer.enqueue('data:audio/wav;base64,10');
    await vi.waitFor(() => expect(started).toHaveLength(3));

    // The engine's 0.4 s / 0.5 s padding is cut down to 30 ms on each side.
    expect(lengths.map((l) => Number(l.toFixed(2)))).toEqual([2.06, 1.56, 1.06]);
    // Each clip starts exactly when the one before ends, plus the pause.
    expect(started[1]! - (started[0]! + lengths[0]!)).toBeCloseTo(SENTENCE_GAP_SECONDS, 5);
    expect(started[2]! - (started[1]! + lengths[1]!)).toBeCloseTo(SENTENCE_GAP_SECONDS, 5);
    expect(audioPlayer.isPlaying()).toBe(true);
  });

  it('starts over after a stop', async () => {
    audioPlayer.enqueue('data:audio/wav;base64,30');
    await vi.waitFor(() => expect(started).toHaveLength(1));
    audioPlayer.stop();
    expect(audioPlayer.isBusy()).toBe(false);
    audioPlayer.enqueue('data:audio/wav;base64,10');
    await vi.waitFor(() => expect(started).toHaveLength(2));
    // Not queued behind the stopped clip.
    expect(started[1]).toBeLessThan(1);
  });
});
