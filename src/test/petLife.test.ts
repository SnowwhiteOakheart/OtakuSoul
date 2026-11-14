// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bondLevel,
  bondProgress,
  BOND_LEVELS,
  care,
  DAILY_CARE_CAP,
  eatMeal,
  emptyBond,
  HUNGER_MS,
  knownFavorite,
  loadBond,
  needs,
  NEW_DAY_POINTS,
  saveBond,
  tastes,
  tasteOf,
  visit,
} from '../components/companion/petBond';
import { AWAY_AFTER_MS, BREAK_AFTER_MS, BREAK_AGAIN_MS, greetingFor, PAUSE_MS, Presence } from '../components/companion/petPresence';
import { CLIMB_HANG_S, CLIMB_TOTAL_S, climbLift, HAND_POSE_S, handWeight } from '../components/avatar/handTimeline';
import { kittenKick } from '../components/avatar/hangTimeline';
import { ELEGANT_SIDE, HARD_LANDING, PetBehavior, WALL_SPLAT, type PetCue } from '../components/companion/petBehavior';
import { LEDGE_GRIP, stepBody, type Body, type Platform } from '../components/companion/petPhysics';

const DAY = 86_400_000;
const noon = (day: number) => new Date(2026, 10, 10 + day, 12).getTime();

describe('pet bond', () => {
  it('counts a new day once and greets for it', () => {
    const first = visit(emptyBond(), noon(0));
    expect(first.newDay).toBe(true);
    expect(first.state.days).toBe(1);
    expect(first.state.points).toBe(NEW_DAY_POINTS);
    const again = visit(first.state, noon(0) + 3_600_000);
    expect(again.newDay).toBe(false);
    expect(again.state).toBe(first.state);
    const later = visit(first.state, noon(3));
    expect(later.away).toBe(3);
    expect(later.state.days).toBe(2);
  });

  it('caps care per day and starts over the next day', () => {
    let state = visit(emptyBond(), noon(0)).state;
    for (let i = 0; i < 100; i++) state = care(state, 'pat', noon(0) + i).state;
    expect(state.dayPoints).toBe(DAILY_CARE_CAP);
    const capped = state.points;
    state = care(state, 'pat', noon(0) + 500).state;
    expect(state.points).toBe(capped);
    state = care(state, 'pat', noon(1)).state;
    expect(state.points).toBeGreaterThan(capped);
  });

  it('reports a level up once the points cross a threshold', () => {
    const near = { ...emptyBond(), points: BOND_LEVELS[1] - 1, day: '2026-11-10' };
    const { state, levelUp } = care(near, 'feed', noon(0));
    expect(levelUp).toBe(1);
    expect(bondLevel(state.points)).toBe(1);
    expect(bondProgress(0)).toEqual({ level: 0, share: 0 });
    expect(bondProgress(BOND_LEVELS[5] + 50).share).toBe(1);
  });

  it('has a fixed favourite and dislike per character, and notices the same food over and over', () => {
    const { favorite, disliked } = tastes('char-1');
    expect(favorite).not.toBe(disliked);
    expect(tastes('char-1')).toEqual({ favorite, disliked });
    let state = emptyBond();
    expect(knownFavorite(state, 'char-1')).toBeNull();
    expect(tasteOf(state, 'char-1', favorite)).toBe('favorite');
    expect(tasteOf(state, 'char-1', disliked)).toBe('disliked');
    const meal = eatMeal(state, 'char-1', favorite, noon(0));
    state = meal.state;
    expect(meal.taste).toBe('favorite');
    expect(knownFavorite(state, 'char-1')).toBe(favorite);
    state = eatMeal(state, 'char-1', favorite, noon(0) + 1).state;
    expect(tasteOf(state, 'char-1', favorite)).toBe('again');
  });

  it('gets hungry after the last meal, never beyond 1, and bored only while the user is here', () => {
    const fed = { ...emptyBond(), lastMealAt: noon(0), lastPlayAt: noon(0) };
    expect(needs(fed, noon(0) + HUNGER_MS / 2, noon(0)).hunger).toBeCloseTo(0.5, 5);
    expect(needs(fed, noon(0) + 10 * DAY, noon(0)).hunger).toBe(1);
    // A visit that just began: no boredom carried over from days away.
    expect(needs(fed, noon(5), noon(5)).boredom).toBe(0);
  });

  describe('storage', () => {
    beforeEach(() => localStorage.clear());
    it('keeps the bond per character and drops unknown foods', () => {
      const state = { ...eatMeal(emptyBond(), 'a', 'cake', noon(0)).state, recent: ['cake', 'pizza'] as never };
      saveBond('a', state);
      const loaded = loadBond('a');
      expect(loaded.meals.cake).toBe(1);
      expect(loaded.recent).toEqual(['cake']);
      expect(loadBond('b')).toEqual(emptyBond());
    });
  });
});

describe('pet presence', () => {
  it('greets a return after a long absence and resets the work stretch after a pause', () => {
    const presence = new Presence(0);
    expect(presence.active(60_000)).toBeNull();
    expect(presence.active(60_000 + AWAY_AFTER_MS)).toBe(AWAY_AFTER_MS);
    expect(presence.workedFor(60_000 + AWAY_AFTER_MS + 1000)).toBe(1000);
  });

  it('suggests a break after long work, again only after a while', () => {
    const presence = new Presence(0);
    for (let t = 0; t <= BREAK_AFTER_MS; t += 60_000) presence.active(t);
    expect(presence.breakDue(BREAK_AFTER_MS)).toBe(true);
    expect(presence.breakDue(BREAK_AFTER_MS + 60_000)).toBe(false);
    for (let t = BREAK_AFTER_MS; t <= BREAK_AFTER_MS + BREAK_AGAIN_MS; t += 60_000) presence.active(t);
    expect(presence.breakDue(BREAK_AFTER_MS + BREAK_AGAIN_MS)).toBe(true);
    // A real pause starts over.
    presence.active(BREAK_AFTER_MS + BREAK_AGAIN_MS + PAUSE_MS + 1);
    expect(presence.breakDue(BREAK_AFTER_MS + BREAK_AGAIN_MS + PAUSE_MS + 2)).toBe(false);
  });

  it('picks the greeting', () => {
    expect(greetingFor(true, 3, DAY * 3, 9)).toBe('longAway');
    expect(greetingFor(true, 1, DAY, 8)).toBe('morning');
    expect(greetingFor(true, 1, DAY, 15)).toBe('newDay');
    expect(greetingFor(false, 0, AWAY_AFTER_MS + 1, 15)).toBe('back');
    expect(greetingFor(false, 0, 60_000, 15)).toBeNull();
  });
});

describe('hand poses', () => {
  it('eases in and out, holds a letter or book until ended', () => {
    expect(handWeight('stretch', 0)).toBe(0);
    expect(handWeight('stretch', HAND_POSE_S.stretch / 2)).toBe(1);
    expect(handWeight('stretch', HAND_POSE_S.stretch)).toBe(0);
    expect(handWeight('read', 100)).toBe(1);
    expect(climbLift(CLIMB_HANG_S - 0.01)).toBe(0);
    expect(climbLift(CLIMB_TOTAL_S)).toBe(1);
  });

  it('kicks in bursts by the collar, tiring', () => {
    expect(kittenKick(0.5)).toBeGreaterThan(0.9);
    const bursts = Array.from({ length: 40 }, (_, i) => kittenKick(2 + i * 0.1));
    expect(Math.min(...bursts)).toBe(0);
    expect(Math.max(...bursts)).toBeGreaterThan(0.5);
    expect(Math.max(...Array.from({ length: 40 }, (_, i) => kittenKick(20 + i * 0.1)))).toBeLessThan(0.4);
  });
});

/** A behaviour standing on the floor, physics on, ticked once. */
function standing(random = () => 0.5) {
  const pet = new PetBehavior(0, random);
  pet.setPhysics(true);
  pet.setGrounded(true, 0);
  pet.tick(0);
  return pet;
}

const bubbles = (cues: PetCue[]) => cues.flatMap((cue) => (cue.kind === 'bubble' ? [cue.text] : []));

describe('pet behaviour life', () => {
  it('hints at hunger with the belly rubbed and a thought', () => {
    const pet = standing();
    expect(pet.hint(100, 'hunger')).toBe(true);
    const { frame, cues } = pet.tick(200);
    expect(frame.hands?.kind).toBe('belly');
    expect(frame.fx?.kind).toBe('thinkFood');
    expect(bubbles(cues)).toContain('hungry');
    // Busy (reacting) it does not hint again.
    expect(pet.hint(300, 'boredom')).toBe(false);
  });

  it('stretches for a break and reads in focus without dozing', () => {
    const pet = standing();
    expect(pet.stretch(100)).toBe(true);
    expect(pet.tick(200).frame.hands?.kind).toBe('stretch');
    const reader = standing();
    reader.setFocus(true, 0);
    expect(reader.stretch(10)).toBe(false);
    const frame = reader.tick(10 * 60_000).frame;
    expect(frame.mode).not.toBe('dozing');
    expect(frame.hands?.kind).toBe('read');
    reader.setFocus(false, 10 * 60_000);
    expect(reader.tick(10 * 60_000 + 100).frame.hands).toBeNull();
  });

  it('holds a letter while carrying one', () => {
    const pet = standing();
    pet.setCarry(true);
    expect(pet.tick(100).frame.hands?.kind).toBe('carry');
    pet.setCarry(false);
    expect(pet.tick(200).frame.hands).toBeNull();
  });

  it('is dazed by a hard landing and lands with a flourish when thrown softly', () => {
    const pet = standing();
    pet.setGrounded(false, 100);
    pet.setGrounded(true, 600, { down: HARD_LANDING + 100, side: 0 });
    let { frame, cues } = pet.tick(700);
    expect(frame.fx?.kind).toBe('dizzy');
    expect(frame.expression).toBe('sad');
    expect(bubbles(cues)).toContain('dizzy');

    const soft = standing(() => 0.1);
    soft.setGrounded(false, 100);
    soft.setGrounded(true, 600, { down: 400, side: ELEGANT_SIDE + 50 });
    ({ frame, cues } = soft.tick(700));
    expect(frame.fx?.kind).toBe('sparkle');
    expect(frame.expression).toBe('happy');
  });

  it('squashes against a side when thrown hard, and lands dazed', () => {
    const pet = standing();
    pet.setGrounded(false, 100);
    pet.wallHit(200, WALL_SPLAT + 1);
    const { frame, cues } = pet.tick(250);
    expect(frame.fx?.kind).toBe('dizzy');
    expect(bubbles(cues)).toContain('splat');
    pet.setGrounded(true, 500, { down: 300, side: 0 });
    expect(pet.tick(600).frame.expression).toBe('sad');
  });

  it('hangs from a caught ledge with the hands up, then is happy on top', () => {
    const pet = standing();
    pet.setGrounded(false, 100);
    pet.setLedge(true, 200);
    pet.setGrounded(true, 200);
    const hanging = pet.tick(300).frame;
    expect(hanging.hands?.kind).toBe('ledge');
    expect(hanging.loop).toBe('fall');
    pet.setLedge(false, 2300);
    const { frame, cues } = pet.tick(2400);
    expect(frame.hands).toBeNull();
    expect(frame.expression).toBe('happy');
    expect(bubbles(cues)).toContain('climbed');
  });

  it('catches the pointer at the end of a chase (play for the bond)', () => {
    const pet = standing();
    expect(pet.come(100, 1, true)).toBe(true);
    pet.arrived(500);
    const { cues } = pet.tick(600);
    expect(bubbles(cues)).toContain('caught');
    expect(cues).toContainEqual({ kind: 'play' });
  });

  it('says something once while dangling by the collar', () => {
    const pet = standing();
    pet.dragStart(0, { grip: 'shoulder', at: { x: 0, y: 0.25 }, anchor: { x: 0, y: 0.25 } });
    expect(bubbles(pet.tick(1000).cues)).not.toContain('dangle');
    expect(bubbles(pet.tick(2500).cues)).toContain('dangle');
    expect(bubbles(pet.tick(5000).cues)).not.toContain('dangle');
  });

  it('pulls a face at food it dislikes and glows at its favourite', () => {
    const picky = standing();
    picky.eat(0, 'disliked');
    expect(picky.tick(3500).frame.expression).toBe('sad');
    const fond = standing();
    fond.eat(0, 'favorite');
    const { frame } = fond.tick(3500);
    expect(frame.expression).toBe('happy');
    expect(frame.fx?.kind).toBe('hearts');
  });
});

describe('pet physics impacts and ledges', () => {
  const size = { width: 200, height: 400 };
  const area = { x: 0, y: 0, width: 2000, height: 1000 };
  const floorTop = area.height - size.height;

  it('reports how fast it came down and hit a side', () => {
    const falling: Body = { x: 500, y: floorTop - 5, vy: 1200, vx: 300, support: null, edge: null };
    const landed = stepBody(falling, size, area, 0.02, 0, 1);
    expect(landed.landed).toBe(true);
    expect(landed.impact?.down).toBeGreaterThan(1200);
    expect(landed.impact?.side).toBeGreaterThan(250);
    const flying: Body = { x: area.width - size.width * 0.7 - 1, y: 100, vy: 0, vx: 2000, support: null, edge: null };
    const hit = stepBody(flying, size, area, 0.02, 0, 1);
    expect(hit.wall).toBe(1);
    expect(hit.wallSpeed).toBeGreaterThan(1900);
  });

  it('catches an edge passing its raised hands and climbs up onto it', () => {
    const edge: Platform = { id: 'w1', left: 300, right: 900, y: 500 };
    // The hands just above the edge, the feet below it, falling.
    const body: Body = { x: 500, y: edge.y - size.height * LEDGE_GRIP - 2, vy: 300, support: null, edge: null };
    const caught = stepBody(body, size, area, 0.02, 0, 1, [edge], false, { ledges: true });
    expect(caught.caught).toBe(true);
    expect(caught.body.ledge?.id).toBe('w1');
    expect(caught.body.y).toBeCloseTo(edge.y - size.height * LEDGE_GRIP, 5);
    let next = caught.body;
    let climbed = false;
    for (let t = 0; t < CLIMB_TOTAL_S + 0.2; t += 0.05) {
      const step = stepBody(next, size, area, 0.05, 0, 1, [edge], false, { ledges: true });
      next = step.body;
      climbed ||= !!step.climbed;
    }
    expect(climbed).toBe(true);
    expect(next.support).toBe('w1');
    expect(next.y).toBeCloseTo(edge.y - size.height, 5);
  });

  it('does not catch edges unless asked (jump planning) and falls when the window goes', () => {
    const edge: Platform = { id: 'w1', left: 300, right: 900, y: 500 };
    const body: Body = { x: 500, y: edge.y - size.height * LEDGE_GRIP - 2, vy: 300, support: null, edge: null };
    expect(stepBody(body, size, area, 0.02, 0, 1, [edge]).caught).toBeFalsy();
    const hanging: Body = { ...body, y: edge.y - size.height * LEDGE_GRIP, vy: 0, ledge: { id: 'w1', t: 0.2 } };
    const gone = stepBody(hanging, size, area, 0.02, 0, 1, [], false, { ledges: true });
    expect(gone.onLedge).toBeFalsy();
    expect(gone.grounded).toBe(false);
  });
});
