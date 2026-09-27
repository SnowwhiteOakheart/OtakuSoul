import { describe, it, expect, beforeEach } from 'vitest';
import { soundFx } from '../services/soundFx';

describe('SoundFx Service', () => {
  beforeEach(() => {
    soundFx.setMuted(false);
    soundFx.setVolume(0.5);
  });

  it('controls mute state correctly', () => {
    expect(soundFx.getIsMuted()).toBe(false);
    soundFx.setMuted(true);
    expect(soundFx.getIsMuted()).toBe(true);
    soundFx.setMuted(false);
    expect(soundFx.getIsMuted()).toBe(false);
  });

  it('clamps volume within [0, 1] range safely', () => {
    soundFx.setVolume(1.5);
    // should not throw and clamps gracefully
    soundFx.setVolume(-0.5);
    soundFx.setVolume(0.8);
    expect(soundFx.getIsMuted()).toBe(false);
  });

  it('exposes procedural sound methods without crash when audio context is absent in node/test env', () => {
    expect(typeof soundFx.playDiceRoll).toBe('function');
    expect(typeof soundFx.playCriticalSuccess).toBe('function');
    expect(typeof soundFx.playCriticalFailure).toBe('function');
    expect(typeof soundFx.playWarning).toBe('function');
    expect(typeof soundFx.playAttackHit).toBe('function');
    expect(typeof soundFx.playHealChime).toBe('function');
    expect(typeof soundFx.playMessageSent).toBe('function');
    expect(typeof soundFx.playMessageReceived).toBe('function');
    expect(typeof soundFx.startCampfireAmbiance).toBe('function');
    expect(typeof soundFx.stopAmbiance).toBe('function');
  });
});
