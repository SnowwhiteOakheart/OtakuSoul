import { describe, expect, it } from 'vitest';
import { bitesTaken, EAT_BITES_S, EAT_TOTAL_S, eatMouth, eatReach } from '../components/avatar/eatTimeline';
import { PetBehavior } from '../components/companion/petBehavior';

describe('eat timeline', () => {
  it('raises the hand, holds it at the mouth through the bites and lowers it', () => {
    expect(eatReach(0)).toBe(0);
    expect(eatReach(0.25)).toBeGreaterThan(0);
    expect(eatReach(0.25)).toBeLessThan(1);
    for (const bite of EAT_BITES_S) expect(eatReach(bite)).toBe(1);
    expect(eatReach(EAT_TOTAL_S - 0.1)).toBeLessThan(0.5);
    expect(eatReach(EAT_TOTAL_S)).toBe(0);
  });

  it('opens the mouth wide before each bite, shuts it at the bite and chews after', () => {
    for (const bite of EAT_BITES_S) {
      expect(eatMouth(bite - 0.01)).toBeGreaterThan(0.6);
      expect(eatMouth(bite + 0.07)).toBeLessThan(0.2);
    }
    // Chewing between the bites: the jaw moves up and down.
    const chew = Array.from({ length: 10 }, (_, i) => eatMouth(EAT_BITES_S[0] + 0.1 + i * 0.05));
    expect(Math.max(...chew) - Math.min(...chew)).toBeGreaterThan(0.1);
    expect(Math.max(...chew)).toBeLessThan(0.35);
    // Closed before the first bite's opening and at the end.
    expect(eatMouth(0.2)).toBe(0);
    expect(eatMouth(EAT_TOTAL_S)).toBe(0);
  });

  it('counts the bites', () => {
    expect(bitesTaken(0)).toBe(0);
    expect(bitesTaken(EAT_BITES_S[0])).toBe(1);
    expect(bitesTaken(EAT_TOTAL_S)).toBe(3);
  });
});

describe('PetBehavior eating', () => {
  it('eats for the whole timeline, chewing, then is delighted', () => {
    const pet = new PetBehavior(0, () => 0.5);
    pet.eat(1000);
    const during = pet.tick(1000 + EAT_BITES_S[0] * 1000 - 10).frame;
    expect(during.eat).not.toBeNull();
    expect(during.mode).toBe('reacting');
    expect(during.mouth).toBeGreaterThan(0.5);
    // Looks down at the food meanwhile, no other action starts.
    expect(during.gaze?.y).toBeLessThan(0);
    const after = pet.tick(1000 + EAT_TOTAL_S * 1000 + 10);
    expect(after.frame.eat).toBeNull();
    expect(after.frame.expression).toBe('happy');
    expect(after.cues).toContainEqual({ kind: 'gesture', role: 'happy' });
  });

  it('a new meal gets a new id', () => {
    const pet = new PetBehavior(0, () => 0.5);
    pet.eat(0);
    const first = pet.tick(100).frame.eat!.id;
    pet.eat(200);
    expect(pet.tick(300).frame.eat!.id).toBe(first + 1);
  });

  it('stops eating when lifted', () => {
    const pet = new PetBehavior(0, () => 0.5);
    pet.eat(0);
    pet.dragStart(500);
    expect(pet.tick(600).frame.eat).toBeNull();
  });
});
