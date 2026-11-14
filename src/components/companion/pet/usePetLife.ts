import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { TranslationKey } from '../../../i18n';
import { api } from '../../../services/api';
import { IS_GUEST_PET, type PetPrefs, type PetWeather } from '../../../services/desktopPet';
import { isNightHour } from '../../../utils/dayTime';
import type { PetBehavior } from '../petBehavior';
import {
  bondLevel,
  care as careFor,
  eatMeal,
  emptyBond,
  knownFavorite,
  loadBond,
  NEED_HINT,
  NEED_HINT_GAP_MS,
  needs,
  saveBond,
  visit,
  type BondCare,
  type PetBondState,
  type Taste,
} from '../petBond';
import type { PetFood } from '../petFood';
import { greetingFor, loadSeen, Presence, saveSeen, type Greeting } from '../petPresence';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Needs, presence and the night are looked at this often (ms). */
const LIFE_TICK_MS = 30_000;
/** The input stamp (Windows) is read this often (ms). */
const INPUT_POLL_MS = 15_000;
/** The weather is asked again after this long (ms). */
const WEATHER_MS = 30 * 60_000;
/** Pointer moves count as activity at most this often (ms). */
const POINTER_ACTIVE_MS = 5000;

const GREETING_KEYS: Record<Greeting, TranslationKey[]> = {
  morning: ['pet.greetMorning1', 'pet.greetMorning2'],
  longAway: ['pet.greetLongAway'],
  newDay: ['pet.greetNewDay'],
  back: ['pet.greetBack1', 'pet.greetBack2'],
};

interface UsePetLifeArgs {
  behavior: PetBehavior;
  prefs: PetPrefs;
  /** The character the pet shows ('' until known): the bond is kept per character. */
  characterKey: string;
  away: boolean;
  say: (text: string, ms?: number) => void;
  tRef: React.RefObject<Translate>;
  speakingRef: React.RefObject<boolean>;
}

export interface PetLife {
  bond: PetBondState;
  /** Hunger and boredom now (0…1), as of the last look. */
  hunger: number;
  boredom: number;
  night: boolean;
  sky: PetWeather['sky'] | null;
  favorite: PetFood['id'] | null;
  /** Care given (pat, high five …): bond points, and a level up is celebrated. */
  care: (kind: BondCare) => void;
  /** A meal eaten: how it went down (for the words after it). */
  meal: (food: PetFood['id']) => Taste;
  /** The pointer moved (counts as the user being here, also where no input stamp is read). */
  pointerMoved: () => void;
}

/**
 * The pet's everyday life with the user: the bond (per character, `petBond.ts`), hints at
 * hunger and boredom, greetings (a new day, back after a while), the break reminder after long
 * uninterrupted work (`petPresence.ts`), the night and, when switched on, the weather. The guest
 * pet only decorates: it keeps no bond and asks for no weather.
 */
export function usePetLife({ behavior, prefs, characterKey, away, say, tRef, speakingRef }: UsePetLifeArgs): PetLife {
  const [bond, setBond] = useState<PetBondState>(emptyBond);
  const bondRef = useRef(bond);
  const keyRef = useRef('');
  const [view, setView] = useState(() => ({ hunger: 0, boredom: 0, night: isNightHour(new Date().getHours()) }));
  const [sky, setSky] = useState<PetWeather['sky'] | null>(null);
  const presence = useRef<Presence | null>(null);
  /** When this visit began (boredom counts from it) and when the next hint may come. */
  const sinceRef = useRef(0);
  const nextHintAt = useRef(0);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const lastPointerActive = useRef(0);

  const store = useCallback(
    (next: PetBondState) => {
      bondRef.current = next;
      setBond(next);
      behavior.setAffection(bondLevel(next.points));
      if (keyRef.current) saveBond(keyRef.current, next);
    },
    [behavior],
  );

  const celebrateLevel = useCallback(
    (level: number | null) => {
      if (level === null) return;
      behavior.levelUp(performance.now());
      say(tRef.current('pet.bondUp', { level }), 6000);
    },
    [behavior, say, tRef],
  );

  /** The user is (back) here after `gap` ms: a new day counts, and it greets fitting to it. */
  const welcome = useCallback(
    (gap: number) => {
      if (IS_GUEST_PET || !keyRef.current) return;
      const now = Date.now();
      const visited = visit(bondRef.current, now);
      if (visited.newDay) store(visited.state);
      const greeting = greetingFor(visited.newDay, visited.away, gap, new Date(now).getHours());
      if (greeting && !speakingRef.current) {
        const level = bondLevel(visited.state.points);
        behavior.greet(performance.now(), level >= 3);
        const keys = GREETING_KEYS[greeting];
        const key = keys[Math.floor(Math.random() * keys.length)]!;
        say(tRef.current(key, { days: greeting === 'longAway' ? visited.away : visited.state.days }), 7000);
      }
      // A level reached by the new day shows after the greeting.
      if (visited.levelUp !== null) window.setTimeout(() => celebrateLevel(visited.levelUp), 2500);
    },
    [behavior, celebrateLevel, say, speakingRef, store, tRef],
  );

  // Another character: its own bond (loaded after the render; a new day greets).
  useEffect(() => {
    if (IS_GUEST_PET || !characterKey || keyRef.current === characterKey) return undefined;
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      const first = keyRef.current === '';
      keyRef.current = characterKey;
      const loaded = loadBond(characterKey);
      bondRef.current = loaded;
      setBond(loaded);
      behavior.setAffection(bondLevel(loaded.points));
      const now = Date.now();
      sinceRef.current = now;
      presence.current ??= new Presence(now);
      nextHintAt.current = now + NEED_HINT_GAP_MS[0];
      // Opening the pet greets (the first character only; switching figures is no arrival).
      if (first) {
        const seen = loadSeen();
        window.setTimeout(() => welcome(seen ? now - seen : Number.POSITIVE_INFINITY), 1800);
      }
    });
    return () => {
      live = false;
    };
  }, [behavior, characterKey, welcome]);

  // Back from the lock screen (or a fullscreen game) after a while: greeted like a return.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    if (away) {
      awaySince.current ??= Date.now();
      return;
    }
    const since = awaySince.current;
    awaySince.current = null;
    if (since === null) return;
    const gap = Date.now() - since;
    presence.current?.active(Date.now());
    window.setTimeout(() => welcome(gap), 1200);
  }, [away, welcome]);

  /** Activity seen: maybe a return to greet. */
  const sawActivity = useCallback(() => {
    const tracker = presence.current;
    if (!tracker || IS_GUEST_PET) return;
    const gap = tracker.active(Date.now());
    if (gap !== null) welcome(gap);
  }, [welcome]);

  const pointerMoved = useCallback(() => {
    const now = Date.now();
    if (now - lastPointerActive.current < POINTER_ACTIVE_MS) return;
    lastPointerActive.current = now;
    sawActivity();
  }, [sawActivity]);

  // Keys and mouse (Windows: only when the last input was, never what).
  useEffect(() => {
    if (IS_GUEST_PET) return undefined;
    let last: number | null = null;
    const poll = window.setInterval(() => {
      void api
        .petInputStamp()
        .then((stamp) => {
          if (stamp === null || stamp === last) return;
          const first = last === null;
          last = stamp;
          if (!first) sawActivity();
        })
        .catch(() => {});
    }, INPUT_POLL_MS);
    return () => window.clearInterval(poll);
  }, [sawActivity]);

  // Every half minute: needs, hints, the break reminder, the night; and remembering the user was here.
  useEffect(() => {
    if (IS_GUEST_PET) return undefined;
    const look = () => {
      const now = Date.now();
      const night = isNightHour(new Date(now).getHours());
      const current = needs(bondRef.current, now, sinceRef.current || now);
      setView((was) =>
        was.night === night && Math.abs(was.hunger - current.hunger) < 0.01 && Math.abs(was.boredom - current.boredom) < 0.01
          ? was
          : { ...current, night },
      );
      const live = prefsRef.current;
      behavior.setTraces(live.traces, live.needs ? current.boredom : 0);
      if (away) return;
      const tracker = presence.current;
      if (tracker && tracker.workedFor(now) > 0) saveSeen(now);
      // Long at work without a pause: a stretch and a hint (not while it reads with the user).
      if (tracker && live.breakReminder && !behavior.focused && tracker.breakDue(now)) {
        if (!speakingRef.current && behavior.stretch(performance.now())) {
          window.setTimeout(() => say(tRef.current('pet.breakHint'), 8000), 1600);
        } else {
          tracker.postpone(now);
        }
      }
      // Hungry or bored now and then: a hint, never more.
      if (!live.needs || !keyRef.current || now < nextHintAt.current || speakingRef.current) return;
      const need = current.hunger >= NEED_HINT ? 'hunger' : current.boredom >= NEED_HINT && tracker && tracker.workedFor(now) > 0 ? 'boredom' : null;
      if (!need) return;
      if (behavior.hint(performance.now(), need)) {
        const [min, max] = NEED_HINT_GAP_MS;
        nextHintAt.current = now + min + Math.random() * (max - min);
      }
    };
    const timer = window.setInterval(look, LIFE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [away, behavior, say, speakingRef, tRef]);

  // The weather, only when switched on with a place (only that place goes to the weather service).
  const city = prefs.weather ? prefs.weatherCity.trim() : '';
  useEffect(() => {
    if (IS_GUEST_PET || !city) {
      void Promise.resolve().then(() => setSky(null));
      return undefined;
    }
    let live = true;
    const ask = () =>
      void api
        .petWeather(city)
        .then((weather) => live && setSky(weather.sky))
        .catch(() => live && setSky(null));
    // Typed in the tab letter by letter: asks only once the place stays a moment.
    const first = window.setTimeout(ask, 1500);
    const timer = window.setInterval(ask, WEATHER_MS);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [city]);

  const care = useCallback(
    (kind: BondCare) => {
      if (IS_GUEST_PET || !keyRef.current) return;
      const { state, levelUp } = careFor(bondRef.current, kind, Date.now());
      store(state);
      celebrateLevel(levelUp);
    },
    [celebrateLevel, store],
  );

  const meal = useCallback(
    (food: PetFood['id']): Taste => {
      if (IS_GUEST_PET || !keyRef.current) return 'fine';
      const { state, taste, levelUp } = eatMeal(bondRef.current, keyRef.current, food, Date.now());
      store(state);
      // After the meal's words.
      if (levelUp !== null) window.setTimeout(() => celebrateLevel(levelUp), 5000);
      return taste;
    },
    [celebrateLevel, store],
  );

  return {
    bond,
    hunger: view.hunger,
    boredom: view.boredom,
    night: view.night,
    sky,
    favorite: characterKey ? knownFavorite(bond, characterKey) : null,
    care,
    meal,
    pointerMoved,
  };
}
