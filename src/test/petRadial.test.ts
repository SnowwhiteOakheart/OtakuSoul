import { describe, expect, it, vi } from 'vitest';
import {
  mainSlices,
  MIN_OPEN_SPAN,
  openArc,
  polar,
  RADIAL_MAX_RADIUS,
  radialRings,
  radialWidth,
  subSlices,
  wrapAngle,
} from '../components/companion/pet/radialLayout';
import { PetBehavior } from '../components/companion/petBehavior';
import { buildPetMenu, type PetMenuArgs } from '../components/companion/pet/petMenuModel';
import { PET_HEIGHT_MIN, PET_HEIGHT_MAX, type PetPrefs } from '../services/desktopPet';

const TAU = Math.PI * 2;

describe('radial menu geometry', () => {
  it('fits the smallest pet and stays at hand on the tallest', () => {
    const small = radialRings(PET_HEIGHT_MIN, 110)!;
    expect(small).not.toBeNull();
    expect(small.r0).toBeGreaterThanOrEqual(20);
    expect(small.r0 < small.r1 && small.r1 < small.r2 && small.r2 < small.r3).toBe(true);
    // Inside the window's height.
    expect(small.cy - small.r3).toBeGreaterThan(0);
    expect(small.cy + small.r3).toBeLessThan(PET_HEIGHT_MIN);
    const tall = radialRings(PET_HEIGHT_MAX, 0)!;
    expect(tall.r3).toBe(RADIAL_MAX_RADIUS);
    expect(radialWidth(tall)).toBeGreaterThanOrEqual(2 * tall.r3);
    // Far too small: the native menu takes over.
    expect(radialRings(100, 0)).toBeNull();
  });

  it('opens the whole circle in the middle of the screen', () => {
    const rings = radialRings(440, 220)!;
    const arc = openArc(rings, { left: 0, top: 0, right: 440, bottom: 440 })!;
    expect(arc).toEqual({ start: 0, span: TAU, full: true });
    const slices = mainSlices(8, arc);
    // The first sector sits on top, all of them around the circle.
    expect(slices[0]!.mid).toBeCloseTo(0);
    expect(slices[7]!.a1 - slices[0]!.a0).toBeCloseTo(TAU);
  });

  it('opens a fan facing inwards at a screen edge', () => {
    const rings = radialRings(440, 220)!;
    // Left of x = 200 is off the screen (the figure stands at the left edge).
    const arc = openArc(rings, { left: 200, top: 0, right: 440, bottom: 440 })!;
    expect(arc.full).toBe(false);
    expect(arc.span).toBeGreaterThan(MIN_OPEN_SPAN);
    for (const slice of mainSlices(8, arc)) {
      for (const a of [slice.a0, slice.a1]) {
        expect(polar(rings.cx, rings.cy, rings.r3, a).x).toBeGreaterThanOrEqual(200 - 1e-6);
      }
    }
    // At the right edge the fan faces left.
    const left = openArc(rings, { left: 0, top: 0, right: 240, bottom: 440 })!;
    for (const slice of mainSlices(8, left)) {
      expect(polar(rings.cx, rings.cy, rings.r3, slice.mid).x).toBeLessThanOrEqual(240);
    }
  });

  it('keeps the sub arc around its item and inside the fan', () => {
    const rings = radialRings(440, 220)!;
    const full = openArc(rings, { left: 0, top: 0, right: 440, bottom: 440 })!;
    const around = mainSlices(8, full)[2]!.mid;
    const subs = subSlices(4, around, rings, full);
    expect((subs[0]!.a0 + subs[3]!.a1) / 2).toBeCloseTo(around);
    const fan = openArc(rings, { left: 200, top: 0, right: 440, bottom: 440 })!;
    const last = mainSlices(8, fan)[7]!;
    const crowded = subSlices(9, last.mid, rings, fan);
    for (const slice of crowded) {
      const along = wrapAngle(slice.a0 - fan.start);
      expect(along).toBeGreaterThanOrEqual(-1e-9);
      expect(along + (slice.a1 - slice.a0)).toBeLessThanOrEqual(fan.span + 1e-9);
    }
  });
});

describe('PetBehavior with the menu open', () => {
  it('starts no idle action until the menu closes', () => {
    const pet = new PetBehavior(0, () => 0);
    pet.attend(0);
    for (let now = 0; now <= 30_000; now += 100) {
      pet.pointer(now);
      expect(pet.tick(now).frame.walk).toBe(0);
      expect(pet.tick(now).frame.gaze).toBeNull();
    }
    pet.endAttend(30_000);
    let started = false;
    for (let now = 30_100; now <= 60_000; now += 100) {
      if (pet.tick(now).frame.gaze !== null) started = true;
    }
    expect(started).toBe(true);
  });
});

describe('pet menu model', () => {
  const prefs = {
    idleActions: true,
    chatBubbles: true,
    physics: false,
    rideWindows: false,
    hideInFullscreen: true,
    batterySaver: true,
    quietAtNight: false,
    reactToDesktop: true,
    frameRate: 30,
    figure: 'chat',
    pose: 'auto',
    openAtStart: false,
    eventRemarks: false,
    commentPrograms: false,
    ambientLight: false,
    desktopLipSync: false,
    ignoredApps: ['game.exe'],
    needs: true,
    breakReminder: true,
    focusMode: true,
    chasePointer: true,
    props: true,
    traces: true,
    weather: false,
    weatherCity: '',
    nudgeWindows: false,
  } satisfies PetPrefs;
  const args = (setPrefs = vi.fn()): PetMenuArgs => ({
    pet: null,
    prefs,
    statusOpen: false,
    canSit: false,
    currentHeight: 440,
    t: (key) => key,
    tEmotion: (emotion) => emotion,
    openCompose: vi.fn(),
    pat: vi.fn(),
    parts: [],
    hiddenParts: [],
    togglePart: vi.fn(),
    peeking: false,
    startPeek: vi.fn(),
    endPeek: vi.fn(),
    feeding: false,
    startFeeding: vi.fn(),
    stopFeeding: vi.fn(),
    timer: null,
    startAlarm: vi.fn(),
    stopAlarm: vi.fn(),
    motionPack: null,
    loadMotionPack: vi.fn(),
    lastApp: 'editor.exe',
    setStatusOpen: vi.fn(),
    setPrefs,
    resizeTo: vi.fn(),
    askTool: vi.fn(),
    openSettings: vi.fn(),
    openApp: vi.fn(),
    hide: vi.fn(),
  });

  it('puts the actions in the ring and every switch in a group', () => {
    const model = buildPetMenu(args());
    expect(model.actions.map((item) => item.id)).toEqual(['compose', 'pat', 'feed', 'timer', 'mood', 'look', 'figure', 'more']);
    const switches = model.settings.flatMap((group) => group.items.map((item) => item.id));
    for (const key of Object.keys(prefs).filter((k) => typeof prefs[k as keyof PetPrefs] === 'boolean')) {
      // Opening at start lives in the Desktop-Pet tab only.
      if (key !== 'openAtStart') expect(switches).toContain(key);
    }
    // Without physics, riding windows and peeking cannot be chosen.
    const ride = model.settings[0]!.items.find((item) => item.id === 'rideWindows');
    expect(ride).toMatchObject({ kind: 'toggle', enabled: false });
    const peek = model.actions.find((item) => item.id === 'look')!.children!.find((item) => item.id === 'peek');
    expect(peek?.enabled).toBe(false);
  });

  it('switches through the shared setter', () => {
    const setPrefs = vi.fn();
    const model = buildPetMenu(args(setPrefs));
    const bubbles = model.settings.flatMap((group) => group.items).find((item) => item.id === 'chatBubbles')!;
    if (bubbles.kind !== 'toggle') throw new Error('expected a toggle');
    bubbles.set(false);
    const update = setPrefs.mock.calls[0]![0] as (p: PetPrefs) => PetPrefs;
    expect(update(prefs).chatBubbles).toBe(false);
    model.apps.allow('game.exe');
    const allowed = setPrefs.mock.calls[1]![0] as (p: PetPrefs) => PetPrefs;
    expect(allowed(prefs).ignoredApps).toEqual([]);
  });
});
