// Web Audio API Procedural Sound Synthesizer
// Completely self-contained: Generates rich sound effects using pure mathematical oscillators & noise nodes

class SoundFxSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;
  private ambianceNode: { stop: () => void } | null = null;
  public isAmbiancePlaying: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.ambianceNode) {
      this.stopAmbiance();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /// Procedural Dice Roll: Series of rapid decaying wooden/marble click impacts
  public playDiceRoll() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const numClicks = Math.floor(Math.random() * 4) + 4; // 4 to 7 bounces

    let timeOffset = 0;
    for (let i = 0; i < numClicks; i++) {
      const clickTime = now + timeOffset;
      const decay = 0.04 + Math.random() * 0.03;
      const baseFreq = 220 + Math.random() * 180;

      // Resonant pop oscillator
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, clickTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, clickTime + decay);

      const clickVolume = (this.volume * 0.4) * (1 - i / numClicks);
      gain.gain.setValueAtTime(clickVolume, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, clickTime + decay);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(clickTime);
      osc.stop(clickTime + decay);

      timeOffset += 0.06 + Math.random() * 0.08 * (i + 1);
    }
  }

  /// Critical 20 Success Fanfare: Radiant major arpeggio
  public playCriticalSuccess() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const startTime = now + idx * 0.09;
      const duration = 0.6;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.volume * 0.45, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }

  /// Critical 1 Failure: Dark descending dissonant buzz
  public playCriticalFailure() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(140, now);
    osc1.frequency.exponentialRampToValueAtTime(45, now + 0.7);

    osc2.frequency.setValueAtTime(148, now); // Dissonant minor second beat
    osc2.frequency.exponentialRampToValueAtTime(48, now + 0.7);

    gain.gain.setValueAtTime(this.volume * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.75);
    osc2.stop(now + 0.75);
  }

  /// Dramatic Warning/Tension Event Stinger
  public playWarning() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.5);

    gain.gain.setValueAtTime(this.volume * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  /// Sword Slash / Combat Attack Hit
  public playAttackHit() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
  }

  /// Healing / Spell Chime
  public playHealChime() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5

    freqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      const startTime = now + idx * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.volume * 0.35, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.85);
    });
  }

  /// Subtle Message Sent Pop/Tick
  public playMessageSent() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

    gain.gain.setValueAtTime(this.volume * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /// Gentle Message Received Chime
  public playMessageReceived() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [659.25, 783.99]; // E5, G5
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const startTime = now + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(this.volume * 0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.16);
    });
  }

  public playSave() {
    this.playMessageSent();
  }

  public playStart() {
    this.playCriticalSuccess();
  }

  public playLevelUp() {
    this.playCriticalSuccess();
  }

  /// Procedural Campfire Ambiance: Low wind drone + random crackle pops
  public toggleCampfireAmbiance(): boolean {
    if (this.ambianceNode) {
      this.stopAmbiance();
      return false;
    }
    this.startCampfireAmbiance();
    return true;
  }

  public startCampfireAmbiance() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const ctx = this.ctx;
    let isRunning = true;

    // 1. Warm background low drone
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    droneOsc.type = 'triangle';
    droneOsc.frequency.setValueAtTime(65, ctx.currentTime);
    droneGain.gain.setValueAtTime(this.volume * 0.08, ctx.currentTime);
    droneOsc.connect(droneGain);
    droneGain.connect(ctx.destination);
    droneOsc.start();

    // 2. Crackle burst interval
    const crackleInterval = setInterval(() => {
      if (!isRunning || !this.ctx || this.isMuted) return;
      if (Math.random() > 0.4) {
        const popTime = this.ctx.currentTime;
        const popOsc = this.ctx.createOscillator();
        const popGain = this.ctx.createGain();
        popOsc.type = 'square';
        popOsc.frequency.setValueAtTime(800 + Math.random() * 1200, popTime);
        popGain.gain.setValueAtTime(this.volume * 0.06, popTime);
        popGain.gain.exponentialRampToValueAtTime(0.0001, popTime + 0.015);
        popOsc.connect(popGain);
        popGain.connect(this.ctx.destination);
        popOsc.start(popTime);
        popOsc.stop(popTime + 0.02);
      }
    }, 120);

    this.ambianceNode = {
      stop: () => {
        isRunning = false;
        clearInterval(crackleInterval);
        try {
          droneOsc.stop();
          droneOsc.disconnect();
        } catch {
          // Already stopped.
        }
      },
    };
    this.isAmbiancePlaying = true;
  }

  public stopAmbiance() {
    if (this.ambianceNode) {
      this.ambianceNode.stop();
      this.ambianceNode = null;
    }
    this.isAmbiancePlaying = false;
  }
}

export const soundFx = new SoundFxSynthesizer();
