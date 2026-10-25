import { describe, expect, it, vi } from 'vitest';
import { cutAtHeard, heardText, INTERRUPTION_MARK } from '../utils/bargeIn';
import { BARGE_IN_DEFAULTS, VoiceCapture, type VoiceCaptureOptions } from '../services/voiceCapture';

const sentences = [
  { text: 'Hallo, schön dich zu sehen!', start: 0, end: 2 },
  { text: '*lächelt* Ich habe heute einen Kuchen gebacken.', start: 2.2, end: 5.2 },
  { text: 'Möchtest du ein Stück?', start: 5.4, end: 6.4 },
];

describe('heardText', () => {
  it('takes whole sentences that ended and the share of the one playing', () => {
    expect(heardText(sentences, 1)).toBe('Hallo, schön');
    expect(heardText(sentences, 2.1)).toBe('Hallo, schön dich zu sehen!');
    expect(heardText(sentences, 3.7)).toBe('Hallo, schön dich zu sehen! *lächelt* Ich habe');
    expect(heardText(sentences, 10)).toBe(sentences.map((s) => s.text).join(' '));
  });

  it('is empty before anything plays and stops at sentences not scheduled yet', () => {
    expect(heardText(sentences, 0)).toBe('');
    expect(heardText([sentences[0]!, { text: 'Noch nicht', start: null, end: null }], 9)).toBe('Hallo, schön dich zu sehen!');
  });
});

describe('cutAtHeard', () => {
  const reply = 'Hallo, schön dich zu sehen!\n\n*lächelt* Ich habe heute einen Kuchen gebacken. Möchtest du ein Stück?';

  it('cuts after the heard words and marks the interruption', () => {
    expect(cutAtHeard(reply, 'Hallo, schön dich zu sehen! *lächelt* Ich habe'))
      .toBe(`Hallo, schön dich zu sehen!\n\n*lächelt* Ich habe ${INTERRUPTION_MARK}`);
  });

  it('leaves the reply alone when all, nothing or something else was heard', () => {
    expect(cutAtHeard(reply, reply)).toBeNull();
    expect(cutAtHeard(reply, '')).toBeNull();
    expect(cutAtHeard(reply, 'Ganz andere Worte hier')).toBeNull();
  });

  it('skips a few words the saved text lacks (tags removed on saving)', () => {
    expect(cutAtHeard('Hallo! Wie geht es dir heute?', '[emotion: joy] Hallo! Wie geht'))
      .toBe(`Hallo! Wie geht ${INTERRUPTION_MARK}`);
  });
});

describe('VoiceCapture listening along', () => {
  const RATE = 48_000;
  const FRAME = 4096;
  /** Feeds one frame of the given RMS level straight into the capture. */
  const feed = (capture: VoiceCapture, level: number) => {
    const samples = new Float32Array(FRAME).fill(level);
    (capture as unknown as { handleAudio: (event: unknown) => void })
      .handleAudio({ inputBuffer: { getChannelData: () => samples } });
  };
  const armed = (options: Partial<VoiceCaptureOptions> & { onBargeIn: () => void }) => {
    const capture = new VoiceCapture();
    Object.assign(capture, {
      active: true,
      armed: true,
      sourceRate: RATE,
      startedAt: performance.now(),
      options: { vadThreshold: 0.02, autoStopOnSilence: true, bargeIn: { ...BARGE_IN_DEFAULTS, onBargeIn: options.onBargeIn }, ...options },
    });
    return capture;
  };
  const chunks = (capture: VoiceCapture) => (capture as unknown as { chunks: Float32Array[] }).chunks.length;

  it('ignores her quieter voice from the speakers and short noises', () => {
    const onBargeIn = vi.fn();
    const capture = armed({ onBargeIn });
    for (let i = 0; i < 30; i += 1) feed(capture, 0.04); // above the threshold, below 2.5×
    feed(capture, 0.2); // a single click
    feed(capture, 0.01);
    expect(onBargeIn).not.toHaveBeenCalled();
    expect(capture.isArmed()).toBe(true);
    // Only the lead-in is kept (600 ms ≈ 8 frames).
    expect(chunks(capture)).toBeLessThanOrEqual(8);
  });

  it('triggers on sustained speech and keeps the lead-in', () => {
    const onBargeIn = vi.fn();
    const capture = armed({ onBargeIn });
    for (let i = 0; i < 20; i += 1) feed(capture, 0.01);
    for (let i = 0; i < 4; i += 1) feed(capture, 0.1); // ~340 ms
    expect(onBargeIn).toHaveBeenCalledOnce();
    expect(capture.isArmed()).toBe(false);
    feed(capture, 0.1);
    expect(chunks(capture)).toBeGreaterThan(4);
  });

  it('disarm() starts a fresh normal recording', () => {
    const capture = armed({ onBargeIn: vi.fn() });
    for (let i = 0; i < 5; i += 1) feed(capture, 0.01);
    capture.disarm();
    expect(capture.isArmed()).toBe(false);
    expect(chunks(capture)).toBe(0);
  });
});
