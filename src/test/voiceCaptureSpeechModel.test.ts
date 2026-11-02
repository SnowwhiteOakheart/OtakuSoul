// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { BARGE_IN_DEFAULTS, VoiceCapture } from '../services/voiceCapture';
import { resetApiMocks } from './mockApi';

/** A microphone whose chunks the test plays in by hand. */
class FakeContext {
  sampleRate = 16_000;
  state = 'running';
  destination = {};
  processor: { onaudioprocess: ((event: unknown) => void) | null; connect: () => void; disconnect: () => void } = {
    onaudioprocess: null,
    connect: () => {},
    disconnect: () => {},
  };
  resume = async () => {};
  close = async () => {
    this.state = 'closed';
  };
  createMediaStreamSource = () => ({ connect: () => {}, disconnect: () => {} });
  createScriptProcessor = () => this.processor;
  createGain = () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} });
}

let context: FakeContext;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** One 4096-sample chunk at a constant level. */
const chunk = (level: number) => {
  const samples = new Float32Array(4096).fill(level);
  context.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
};

beforeEach(() => {
  resetApiMocks();
  context = new FakeContext();
  vi.stubGlobal('AudioContext', vi.fn(function AudioContextMock() { return context; }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('VoiceCapture with Silero', () => {
  it('a loud sound counts only when Silero hears a voice', async () => {
    vi.mocked(api.vadProcess).mockResolvedValue(0.02);
    const capture = new VoiceCapture();
    const levels: boolean[] = [];
    await capture.start({ vadThreshold: 0.025, speechModel: true, onLevel: (_, speech) => levels.push(speech) });
    await flush();
    expect(api.vadOpen).toHaveBeenCalledTimes(1);

    chunk(0.2); // no verdict yet: the level decides
    await flush();
    capture.cancel();
    expect(levels.at(-1)).toBe(true);
  });

  it('typing (loud, but no voice) does not start a recording; speech does', async () => {
    let probability = 0.02;
    vi.mocked(api.vadProcess).mockImplementation(async () => probability);
    const capture = new VoiceCapture();
    await capture.start({ vadThreshold: 0.025, speechModel: true });
    await flush();
    chunk(0.2);
    await flush();
    chunk(0.2); // Silero said "no voice" for the chunk before
    await flush();
    const typing = capture as unknown as { speechDetected: boolean };
    typing.speechDetected = false;
    chunk(0.2);
    expect(typing.speechDetected).toBe(false);

    probability = 0.95;
    chunk(0.2);
    await flush();
    chunk(0.2);
    expect(typing.speechDetected).toBe(true);
    await capture.stop();
    expect(api.vadClose).toHaveBeenCalledTimes(1);
    const [stream, samples] = vi.mocked(api.vadProcess).mock.calls[0]!;
    expect(stream).toBe(vi.mocked(api.vadOpen).mock.calls[0]![0]);
    expect(samples).toHaveLength(4096);
  });

  it('barge-in ignores typing while the character speaks', async () => {
    vi.mocked(api.vadProcess).mockResolvedValue(0.01);
    const onBargeIn = vi.fn();
    const capture = new VoiceCapture();
    await capture.start({ vadThreshold: 0.025, speechModel: true, bargeIn: { ...BARGE_IN_DEFAULTS, onBargeIn } });
    await flush();
    for (let i = 0; i < 12; i += 1) {
      chunk(0.3);
      await flush();
    }
    expect(onBargeIn).not.toHaveBeenCalled();
    vi.mocked(api.vadProcess).mockResolvedValue(0.9);
    for (let i = 0; i < 8; i += 1) {
      chunk(0.3);
      await flush();
    }
    expect(onBargeIn).toHaveBeenCalledTimes(1);
    await capture.cancel();
  });

  it('without the model the level decides as before', async () => {
    vi.mocked(api.vadOpen).mockRejectedValue('offline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const capture = new VoiceCapture();
    await capture.start({ vadThreshold: 0.025, speechModel: true });
    await flush();
    chunk(0.2);
    expect((capture as unknown as { speechDetected: boolean }).speechDetected).toBe(true);
    expect(api.vadProcess).not.toHaveBeenCalled();
    await capture.cancel();
    warn.mockRestore();
  });

  it('switched off it never asks Silero', async () => {
    const capture = new VoiceCapture();
    await capture.start({ vadThreshold: 0.025 });
    chunk(0.2);
    await flush();
    expect(api.vadOpen).not.toHaveBeenCalled();
    expect(api.vadProcess).not.toHaveBeenCalled();
    await capture.cancel();
  });
});
