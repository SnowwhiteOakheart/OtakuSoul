import { describe, expect, it } from 'vitest';
import {
  bubbleMs,
  bubbleSide,
  bubbleText,
  DOZE_AFTER_MS,
  eyeLine,
  HEAD_ZONE_END,
  headZoneEnd,
  isNightHour,
  NEUTRAL_DRIVE,
  PetBehavior,
  touchZoneAt,
  type PetDrive,
} from '../components/companion/petBehavior';

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

  it('dozes off sooner when tired or at night', () => {
    const dozeTime = (drive: Partial<PetDrive>) => {
      const pet = new PetBehavior(0, fixed(0.5));
      pet.setIdleActions(false);
      pet.setDrive({ ...NEUTRAL_DRIVE, ...drive });
      for (let now = 0; now <= DOZE_AFTER_MS; now += 100) if (pet.tick(now).frame.mode === 'dozing') return now;
      return Infinity;
    };
    expect(dozeTime({})).toBe(Infinity);
    expect(dozeTime({ fatigue: 100 })).toBeLessThan(DOZE_AFTER_MS * 0.5);
    expect(dozeTime({ night: true })).toBeLessThanOrEqual(DOZE_AFTER_MS * 0.5 + 100);
  });

  it('yawns instead of hopping when tired, hops instead of yawning when lively', () => {
    // The pointer moves, so the weights are: lookAround 0, yawn 10, hop 15, wave 10, ...
    const firstAction = (drive: Partial<PetDrive>, roll: number) => {
      const pet = new PetBehavior(0, fixed(0, roll));
      pet.setDrive({ ...NEUTRAL_DRIVE, ...drive });
      for (let now = 0; now <= 9000; now += 100) {
        pet.pointer(now);
        const { frame } = pet.tick(now);
        if (frame.expression === 'relaxed') return 'yawn';
        if (frame.hop) return 'hop';
      }
      return 'none';
    };
    expect(firstAction({ fatigue: 100 }, 0.1)).toBe('yawn');
    expect(firstAction({}, 0.1)).toBe('yawn');
    // Roll 0.2 lies behind yawn (10 of 90) in the hop range; tiredness widens yawn (30 of 110) over it.
    expect(firstAction({}, 0.2)).toBe('hop');
    expect(firstAction({ fatigue: 100 }, 0.2)).toBe('yawn');
  });

  it('does nothing on its own while saving power, but still dozes off', () => {
    const pet = new PetBehavior(0, fixed(0));
    pet.setSaving(true);
    const quiet = run(pet, 0, 30_000);
    expect(quiet.frame).toMatchObject({ mode: 'idle', gaze: null, expression: null, hop: false });
    expect(quiet.cues).toEqual([]);
    expect(run(pet, 30_100, DOZE_AFTER_MS + 200).frame.mode).toBe('dozing');
  });

  it('asks for a jump only when an edge is in reach, and leaps happily until it lands', () => {
    const pet = new PetBehavior(0, fixed(0, 0.99));
    // Nothing in reach: no jump cue however long it idles (last pick is the walk, weight 30).
    expect(run(pet, 0, 9000).cues).not.toContainEqual({ kind: 'jump' });

    const ready = new PetBehavior(0, fixed(0, 0.99));
    ready.setCanJump(true);
    // 0.99 of the total lands on the last weighted entry: the jump.
    const asked = run(ready, 0, 9000);
    expect(asked.cues).toContainEqual({ kind: 'jump' });

    ready.jumped(9000);
    ready.setGrounded(false, 9100);
    expect(ready.tick(9100).frame).toMatchObject({ mode: 'falling', expression: 'happy' });
    ready.setGrounded(true, 9900);
    expect(ready.tick(9900).frame).toMatchObject({ mode: 'reacting', expression: 'happy', hop: false });
  });

  it('glances after a window switch, but not too often', () => {
    const pet = new PetBehavior(0, fixed(0.9));
    pet.windowSwitched(1000);
    expect(pet.tick(1100).frame).toMatchObject({ mode: 'reacting', gaze: { x: 0.7, y: 0.05 } });
    expect(run(pet, 1200, 3000).frame.mode).toBe('idle');
    pet.windowSwitched(3500);
    expect(pet.tick(3600).frame.mode).toBe('idle');
    pet.windowSwitched(9500);
    expect(pet.tick(9600).frame.mode).toBe('reacting');
  });

  it('listens to music: relaxed face, head dips on the beat', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setIdleActions(false);
    pet.setMusic(true);
    expect(pet.tick(100).frame).toMatchObject({ mode: 'idle', expression: 'relaxed', gaze: null });
    pet.beat(200);
    expect(pet.tick(300).frame.gaze).toEqual({ x: 0, y: -0.55 });
    expect(pet.tick(500).frame.gaze).toBeNull();
    pet.setMusic(false);
    expect(pet.tick(600).frame.expression).toBeNull();
  });

  it('ignores music and glances while saving power', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setIdleActions(false);
    pet.setSaving(true);
    pet.setMusic(true);
    pet.beat(200);
    expect(pet.tick(300).frame).toMatchObject({ expression: null, gaze: null });
    pet.windowSwitched(400);
    expect(pet.tick(500).frame.mode).toBe('idle');
  });

  it('greets with a wave when the character writes on their own, also out of a doze', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setIdleActions(false);
    run(pet, 0, DOZE_AFTER_MS + 200);
    pet.announce(DOZE_AFTER_MS + 300);
    const woke = pet.tick(DOZE_AFTER_MS + 300);
    expect(woke.frame).toMatchObject({ mode: 'reacting', expression: 'happy', hop: true });
    expect(woke.cues).toContainEqual({ kind: 'gesture', role: 'greeting' });
  });

  it('counts 23:00 to 06:00 as night', () => {
    expect([22, 23, 0, 5, 6, 12].map(isNightHour)).toEqual([false, true, true, true, false, false]);
  });

  it('looks surprised while dragged and calms down after release', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.dragStart(1000);
    expect(pet.tick(1500).frame).toMatchObject({ mode: 'dragged', expression: 'surprised' });
    pet.dragEnd(2000);
    expect(pet.tick(2100).frame).toMatchObject({ mode: 'reacting', expression: 'relaxed' });
    expect(pet.tick(3100).frame.mode).toBe('idle');
  });

  it('blushes with lowered eyes when stroked on the head', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.pat(500, 'head');
    const { frame, cues } = pet.tick(600);
    expect(frame).toMatchObject({ mode: 'reacting', expression: 'blush', hop: false });
    expect(frame.gaze!.y).toBeLessThan(0);
    expect(cues).toEqual([{ kind: 'gesture', role: 'happy' }]);
  });

  it('startles with a jump when poked on the body', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.pat(500, 'body');
    expect(pet.tick(600).frame).toMatchObject({ mode: 'reacting', expression: 'surprised', hop: true });
    expect(pet.tick(1500).frame.mode).toBe('idle');
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

  it('sits on a window edge only with a sitting motion', () => {
    // Random 0.99 picks the last weighted action: sit once it is possible.
    const without = new PetBehavior(0, fixed(0.99));
    without.setOnWindow(true);
    expect(run(without, 0, 21_000).frame.mode).toBe('walking');

    const pet = new PetBehavior(0, fixed(0.99));
    pet.setOnWindow(true);
    pet.setSitMotion(true);
    const { frame } = run(pet, 0, 21_000);
    expect(frame).toMatchObject({ mode: 'sitting', loop: 'sit', walk: 0 });
    // Its window goes away: it stops sitting.
    pet.setOnWindow(false);
    expect(pet.tick(21_100).frame.loop).not.toBe('sit');
  });

  it('asks for the walking loop while walking', () => {
    const pet = new PetBehavior(0, fixed(0.99));
    expect(run(pet, 0, 21_000).frame.loop).toBe('walk');
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

  it('walks to the pointer when called and greets on arrival', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    expect(pet.come(100, -1)).toBe(true);
    expect(pet.coming).toBe(true);
    expect(pet.tick(200).frame).toMatchObject({ mode: 'walking', walk: -1, loop: 'walk' });
    // Idle actions do not replace the walk, even long after the usual walking time.
    expect(pet.tick(15_000).frame.walk).toBe(-1);
    pet.arrived(15_100);
    expect(pet.coming).toBe(false);
    const { frame, cues } = pet.tick(15_200);
    expect(frame).toMatchObject({ walk: 0, hop: true });
    expect(cues).toContainEqual({ kind: 'gesture', role: 'greeting' });
  });

  it('stops at a wall instead of turning around when called', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.come(0, 1);
    pet.bumped(1, 500);
    expect(pet.coming).toBe(false);
    expect(pet.tick(600).frame.walk).toBe(0);
  });

  it('cannot walk over when called without physics or in the air', () => {
    const still = new PetBehavior(0, fixed(0.5));
    still.setPhysics(false);
    expect(still.come(100, 1)).toBe(false);
    const falling = new PetBehavior(0, fixed(0.5));
    falling.setGrounded(false, 50);
    expect(falling.come(100, 1)).toBe(false);
  });

  it('wakes up when called while dozing', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.setIdleActions(false);
    expect(pet.tick(DOZE_AFTER_MS + 100).frame.mode).toBe('dozing');
    expect(pet.come(DOZE_AFTER_MS + 200, 1)).toBe(true);
    expect(pet.tick(DOZE_AFTER_MS + 300).frame.mode).toBe('walking');
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

describe('hands', () => {
  it('a high five delights with a hop and a wave', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.highFive(100);
    const { frame, cues } = pet.tick(200);
    expect(frame).toMatchObject({ mode: 'reacting', expression: 'happy', hop: true });
    expect(cues).toContainEqual({ kind: 'gesture', role: 'greeting' });
    expect(pet.tick(1700).frame.mode).toBe('idle');
  });

  it('holds hands blushing until let go, then goes back to normal', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.holdHand(100);
    // Still holding long after any other reaction would have ended.
    expect(pet.tick(60_000).frame).toMatchObject({ mode: 'reacting', expression: 'blush', gaze: { x: 0, y: -0.45 } });
    pet.releaseHand(60_100);
    expect(pet.tick(60_200).frame).toMatchObject({ mode: 'reacting', expression: 'happy' });
    expect(pet.tick(61_400).frame.mode).toBe('idle');
    // Idle actions come back afterwards.
    expect(run(pet, 61_400, 90_000).frame.mode).not.toBe('reacting');
  });

  it('a drag ends holding hands', () => {
    const pet = new PetBehavior(0, fixed(0.5));
    pet.holdHand(100);
    pet.dragStart(200);
    expect(pet.tick(300).frame.mode).toBe('dragged');
    pet.dragEnd(400);
    expect(pet.tick(2000).frame.mode).toBe('idle');
  });
});

describe('bubbleSide', () => {
  it('leans towards the screen’s middle near an edge', () => {
    expect(bubbleSide(100, 0, 1920)).toBe('right');
    expect(bubbleSide(1800, 0, 1920)).toBe('left');
    expect(bubbleSide(960, 0, 1920)).toBe('center');
  });

  it('counts on the monitor the figure stands on', () => {
    // Second monitor to the right of the first.
    expect(bubbleSide(2000, 1920, 2560)).toBe('right');
    expect(bubbleSide(4400, 1920, 2560)).toBe('left');
    expect(bubbleSide(500, 0, 0)).toBe('center');
  });
});

describe('head zone', () => {
  it('uses the default framing until the figure reports its head', () => {
    expect(headZoneEnd(null)).toBe(HEAD_ZONE_END);
    expect(touchZoneAt(0.3, headZoneEnd(null))).toBe('head');
    expect(touchZoneAt(0.4, headZoneEnd(null))).toBe('body');
  });

  it('follows the figure’s own head line (a chibi head reaches further down)', () => {
    const chibi = headZoneEnd(0.55);
    expect(touchZoneAt(0.5, chibi)).toBe('head');
    expect(touchZoneAt(0.6, chibi)).toBe('body');
  });

  it('moves down while the figure sits lower in the window', () => {
    expect(headZoneEnd(0.34, 0.2)).toBeCloseTo(0.54);
    expect(touchZoneAt(0.45, headZoneEnd(0.34, 0.2))).toBe('head');
  });

  it('puts the eyes a little above the head line', () => {
    expect(eyeLine(HEAD_ZONE_END)).toBeCloseTo(0.272);
    expect(eyeLine(0.5)).toBeLessThan(0.5);
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
