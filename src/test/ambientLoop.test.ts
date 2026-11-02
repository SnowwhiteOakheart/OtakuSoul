import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIENT_FADE_MS, AmbientLoop, SEAM_SECONDS } from '../services/ambientLoop';

class FakeAudio extends EventTarget {
  volume = 1;
  loop = false;
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  constructor(public src: string) {
    super();
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
  /** Playback reached `seconds`. */
  at(seconds: number) {
    this.currentTime = seconds;
    this.dispatchEvent(new Event('timeupdate'));
  }
}

const setup = (volume = 0.5) => {
  const made: FakeAudio[] = [];
  const loop = new AmbientLoop('rain.ogg', volume, (src) => {
    const audio = new FakeAudio(src);
    made.push(audio);
    return audio as unknown as HTMLAudioElement;
  });
  return { loop, made };
};

describe('AmbientLoop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fades in on start and out on stop', () => {
    const { loop, made } = setup();
    loop.start();
    const first = made[0]!;
    expect(first.paused).toBe(false);
    expect(first.volume).toBe(0);
    vi.advanceTimersByTime(AMBIENT_FADE_MS / 2);
    expect(first.volume).toBeCloseTo(0.25, 2);
    vi.advanceTimersByTime(AMBIENT_FADE_MS);
    expect(first.volume).toBeCloseTo(0.5, 5);

    loop.stop();
    expect(first.paused).toBe(false);
    vi.advanceTimersByTime(AMBIENT_FADE_MS);
    expect(first.volume).toBe(0);
    expect(first.paused).toBe(true);
  });

  it('overlaps the next pass at the loop point instead of a hard seam', () => {
    const { loop, made } = setup();
    loop.start();
    vi.advanceTimersByTime(AMBIENT_FADE_MS);
    const first = made[0]!;
    first.duration = 30;
    first.at(20);
    expect(made).toHaveLength(1);

    first.at(30 - SEAM_SECONDS + 0.1);
    const second = made[1]!;
    expect(second.paused).toBe(false);
    expect(second.currentTime).toBe(0);
    vi.advanceTimersByTime((SEAM_SECONDS * 1000) / 2);
    expect(second.volume).toBeGreaterThan(0.1);
    expect(first.volume).toBeLessThan(0.5);
    vi.advanceTimersByTime(AMBIENT_FADE_MS);
    expect(second.volume).toBeCloseTo(0.5, 5);
    expect(first.paused).toBe(true);

    // The next seam goes back to the first element; no new elements pile up.
    second.duration = 30;
    second.at(29);
    expect(made).toHaveLength(2);
    expect(first.paused).toBe(false);
    expect(first.currentTime).toBe(0);
  });

  it('a short sound loops plainly', () => {
    const { loop, made } = setup();
    loop.start();
    made[0]!.duration = 4;
    made[0]!.at(3.5);
    expect(made[0]!.loop).toBe(true);
    expect(made).toHaveLength(1);
  });

  it('follows the volume and stops overlapping after stop', () => {
    const { loop, made } = setup();
    loop.start();
    vi.advanceTimersByTime(AMBIENT_FADE_MS);
    loop.setVolume(0.2);
    expect(made[0]!.volume).toBe(0.2);
    loop.stop();
    made[0]!.duration = 30;
    made[0]!.at(29.5);
    expect(made).toHaveLength(1);
  });
});
