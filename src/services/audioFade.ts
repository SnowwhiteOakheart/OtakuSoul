/** Step of a volume fade (ms). */
const FADE_STEP_MS = 50;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Fades the volume of audio elements; a new fade of an element replaces its running one. */
export class AudioFader {
  private fades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>();

  isFading(audio: HTMLAudioElement) {
    return this.fades.has(audio);
  }

  cancel(audio: HTMLAudioElement) {
    const running = this.fades.get(audio);
    if (running) clearInterval(running);
    this.fades.delete(audio);
  }

  /** Moves the volume to `target` within `ms`; `done` runs at the end (not after a cancel). */
  fadeTo(audio: HTMLAudioElement, target: number, ms: number, done?: () => void) {
    this.cancel(audio);
    const from = audio.volume;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      audio.volume = clamp(from + ((target - from) * step) / steps);
      if (step >= steps) {
        this.cancel(audio);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(audio, timer);
  }

  /** Fades out, then stops the element and frees its file. */
  fadeOut(audio: HTMLAudioElement, ms: number) {
    this.fadeTo(audio, 0, ms, () => {
      audio.pause();
      audio.removeAttribute('src');
    });
  }
}
