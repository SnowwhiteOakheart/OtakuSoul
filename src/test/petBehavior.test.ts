import { describe, expect, it } from 'vitest';
import { bubbleMs, bubbleText, DOZE_AFTER_MS, PetBehavior } from '../components/companion/petBehavior';

/** Repeats the given values as "random" numbers. */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Ticks every 100 ms from `from` to `to`, keeping the last frame and all cues. */
function run(pet: PetBehavior, from: number, to: number) {
  let last = pet.tick(from);
  const cues = [...last.cues];
  for (let now = from + 100; now <= to; now += 100) {
    last = pet.tick(now);
    cues.push(...last.cues);
  }
  return { frame: last.frame, cues };
}

describe('PetBehavior', () => {
  it('stands idle and follows the pointer at first', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    const { frame } = pet.tick(100);
    expect(frame).toMatchObject({ mode: 'idle', gaze: null, expression: null, mouth: 0 });
  });

  it('starts a random action after the pause and returns to idle afterwards', () => {
    // Pause 8 s (random 0), then the first weighted action: lookAround with a resting pointer.
    const pet = new PetBehavior(0, fixed(0));
    const during = run(pet, 0, 9000).frame;
    expect(during.mode).toBe('idle');
    expect(during.gaze).not.toBeNull();
    const after = run(pet, 9100, 12_000).frame;
    expect(after.gaze).toBeNull();
  });

  it('does not look around on its own while the pointer moves', () => {
    const pet = new PetBehavior(0, fixed(0));
    let frame;
    for (let now = 0; now <= 9000; now += 100) {
      pet.pointer(now);
      frame = pet.tick(now).frame;
    }
    // With an active pointer the first pick is a yawn (look-around weight is 0).
    expect(frame!.expression).toBe('relaxed');
    expect(frame!.mouth).toBeGreaterThan(0);
  });

  it('keeps still when idle actions are off', () => {
    const pet = new PetBehavior(0, fixed(0));
    pet.setIdleActions(false);
    const { frame, cues } = run(pet, 0, 30_000);
    expect(frame).toMatchObject({ mode: 'idle', gaze: null, expression: null, hop: false });
    expect(cues).toEqual([]);
  });

  it('dozes off without pointer and wakes up surprised', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setIdleActions(false);
    const dozing = run(pet, 0, DOZE_AFTER_MS + 200);
    expect(dozing.frame.mode).toBe('dozing');
    expect(dozing.cues).toContainEqual({ kind: 'bubble', text: 'doze' });

    pet.pointer(DOZE_AFTER_MS + 300);
    const woke = pet.tick(DOZE_AFTER_MS + 300);
    expect(woke.frame).toMatchObject({ mode: 'reacting', expression: 'surprised', hop: true });
    expect(woke.cues).toContainEqual({ kind: 'bubble', text: 'wake' });
    expect(run(pet, DOZE_AFTER_MS + 400, DOZE_AFTER_MS + 3000).frame.mode).toBe('idle');
  });

  it('looks surprised while dragged and calms down after release', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.dragStart(1000);
    expect(pet.tick(1500).frame).toMatchObject({ mode: 'dragged', expression: 'surprised' });
    pet.dragEnd(2000);
    expect(pet.tick(2100).frame).toMatchObject({ mode: 'reacting', expression: 'relaxed' });
    expect(pet.tick(3100).frame.mode).toBe('idle');
  });

  it('smiles and hops when patted and asks for the happy gesture', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.pat(500);
    const { frame, cues } = pet.tick(600);
    expect(frame).toMatchObject({ mode: 'reacting', expression: 'happy', hop: true });
    expect(cues).toEqual([{ kind: 'gesture', role: 'happy' }]);
  });

  it('attends to a chat reply and does nothing random meanwhile', () => {
    const pet = new PetBehavior(0, fixed(0));
    pet.say(0, 15_000);
    const { frame, cues } = run(pet, 0, 14_000);
    expect(frame.mode).toBe('talking');
    expect(cues).toEqual([]);
    expect(run(pet, 15_100, 15_200).frame.mode).toBe('idle');
  });

  it('stays talking while the voice plays', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setSpeaking(true);
    expect(pet.tick(100).frame.mode).toBe('talking');
    pet.setSpeaking(false);
    expect(pet.tick(200).frame.mode).toBe('idle');
  });
});

describe('PetBehavior on the desktop floor', () => {
  // Random 0.99: longest pause (20 s), then the last weighted action (walk), to the right.
  it('walks along the floor, turned into the walking direction', () => {
    const pet = new PetBehavior(0, fixed(0.99));
    const { frame } = run(pet, 0, 21_000);
    expect(frame).toMatchObject({ mode: 'walking', walk: 1 });
    expect(frame.turn).toBeGreaterThan(0);
  });

  it('turns around at a wall', () => {
    const pet = new PetBehavior(0, fixed(0.99));
    run(pet, 0, 21_000);
    pet.bumped(1);
    const { frame } = pet.tick(21_100);
    expect(frame.walk).toBe(-1);
    expect(frame.turn).toBeLessThan(0);
  });

  it('does not walk without physics', () => {
    const pet = new PetBehavior(0, fixed(0.99));
    pet.setPhysics(false);
    const { frame } = run(pet, 0, 21_000);
    expect(frame.walk).toBe(0);
  });

  it('falls when it leaves the floor and lands surprised', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setGrounded(false, 100);
    expect(pet.tick(200).frame).toMatchObject({ mode: 'falling', expression: 'surprised', walk: 0 });
    pet.setGrounded(true, 900);
    expect(pet.tick(1000).frame).toMatchObject({ mode: 'reacting', expression: 'surprised', hop: true });
    expect(pet.tick(1700).frame.mode).toBe('idle');
  });

  it('stays dragged while held in the air and falls after release', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.dragStart(100);
    pet.setGrounded(false, 200);
    expect(pet.tick(300).frame.mode).toBe('dragged');
    pet.dragEnd(400);
    pet.setGrounded(false, 450);
    expect(pet.tick(500).frame.mode).toBe('falling');
  });
});

describe('bubbleText', () => {
  it('drops markdown marks, think blocks and the emotion tag', () => {
    expect(bubbleText('<think>hmm</think>*lächelt* Hallo **du**!\n\n[emotion: joy]')).toBe('lächelt Hallo du!');
  });

  it('cuts long replies at a word boundary', () => {
    const text = bubbleText(`${'Wort '.repeat(60)}Ende`);
    expect(text.length).toBeLessThanOrEqual(181);
    expect(text.endsWith('Wort…')).toBe(true);
  });

  it('keeps a bubble readable for 4 to 12 seconds', () => {
    expect(bubbleMs('Hi')).toBe(4000);
    expect(bubbleMs('x'.repeat(500))).toBe(12_000);
  });
});
