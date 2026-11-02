import { AudioFader } from './audioFade';

/** Fade on start, stop and a change of the sound (ms). */
export const AMBIENT_FADE_MS = 2000;
/** Overlap at the loop point: shortly before the end the next pass fades in from the start (s). */
export const SEAM_SECONDS = 2;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Loops one ambient sound without a hard seam: two elements of the same file take turns, the
 * next pass fades in while the end of the current one fades out. Sounds shorter than three
 * overlaps loop plainly. Starting, stopping and the volume fade too.
 */
export class AmbientLoop {
  private readonly fader = new AudioFader();
  private readonly passes: HTMLAudioElement[] = [];
  private current: HTMLAudioElement | null = null;
  private stopped = false;

  constructor(
    private readonly src: string,
    private volume: number,
    private readonly createAudio: (src: string) => HTMLAudioElement = (url) => new Audio(url),
  ) {}

  start() {
    this.stopped = false;
    this.begin(this.pass(0), AMBIENT_FADE_MS);
  }

  /** Fades out and stops; the loop can't be started again. */
  stop() {
    this.stopped = true;
    for (const audio of this.passes) this.fader.fadeOut(audio, AMBIENT_FADE_MS);
    this.current = null;
  }

  setVolume(volume: number) {
    this.volume = clamp(volume);
    const audio = this.current;
    if (!audio) return;
    if (this.fader.isFading(audio)) this.fader.fadeTo(audio, this.volume, AMBIENT_FADE_MS / 4);
    else audio.volume = this.volume;
  }

  private pass(index: number) {
    let audio = this.passes[index];
    if (!audio) {
      audio = this.createAudio(this.src);
      audio.addEventListener('timeupdate', () => this.onTime(audio!));
      audio.addEventListener('ended', () => {
        // Fallback when the overlap was missed (a stalled tab): restart without a fade.
        if (audio === this.current && !this.stopped) this.begin(audio, 0);
      });
      this.passes[index] = audio;
    }
    return audio;
  }

  private begin(audio: HTMLAudioElement, fadeMs: number) {
    if (this.current && this.current !== audio) this.fader.fadeOut(this.current, fadeMs || AMBIENT_FADE_MS);
    this.current = audio;
    audio.currentTime = 0;
    audio.volume = fadeMs > 0 ? 0 : this.volume;
    void audio.play().catch((error: unknown) => console.warn('Ambient playback failed:', error));
    if (fadeMs > 0) this.fader.fadeTo(audio, this.volume, fadeMs);
  }

  private onTime(audio: HTMLAudioElement) {
    if (audio !== this.current || this.stopped) return;
    const { duration, currentTime } = audio;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (duration < SEAM_SECONDS * 3) {
      audio.loop = true;
      return;
    }
    if (duration - currentTime > SEAM_SECONDS) return;
    const next = this.pass(this.passes.indexOf(audio) === 0 ? 1 : 0);
    this.begin(next, SEAM_SECONDS * 1000);
  }
}
