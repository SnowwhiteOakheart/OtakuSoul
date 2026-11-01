// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }));
import { pickTrack, playableMood, sceneMood, StageMusicPlayer } from '../services/stageMusic';
import type { Combatant, SceneState, StageMusicTrack } from '../types';

const track = (mood: string, name: string): StageMusicTrack => ({ mood, name, path: `/music/${mood}/${name}` });
const fighter = (role: string, hp: number) => ({ id: role, name: role, role, hp }) as unknown as Combatant;
const scene = (active: boolean, combatants: Combatant[], current_music_mood: string | null = null) =>
  ({ combat: { is_active: active, combatants }, current_music_mood }) as unknown as SceneState;

describe('stage music mood', () => {
  it('a fight decides, a living boss makes it a boss fight', () => {
    expect(sceneMood(scene(true, [fighter('enemy', 5)], 'romance'))).toBe('combat');
    expect(sceneMood(scene(true, [fighter('enemy', 5), fighter('boss', 20)]))).toBe('boss');
    expect(sceneMood(scene(true, [fighter('boss', 0)]))).toBe('combat');
    expect(sceneMood(scene(true, [], 'boss'))).toBe('boss');
  });

  it('outside a fight the game master picks; fight music ends with the fight', () => {
    expect(sceneMood(scene(false, [], 'tavern'))).toBe('tavern');
    expect(sceneMood(scene(false, [], 'combat'))).toBe('calm');
    expect(sceneMood(scene(false, [], 'disco'))).toBe('calm');
    expect(sceneMood(null)).toBe('calm');
  });

  it('a mood without tracks borrows from a related one', () => {
    const tracks = [track('tension', 'a.ogg'), track('calm', 'b.ogg')];
    expect(playableMood('boss', tracks)).toBe('tension');
    expect(playableMood('tavern', tracks)).toBe('calm');
    expect(playableMood('calm', [track('combat', 'c.ogg')])).toBeNull();
  });

  it('does not repeat the track that just played', () => {
    const tracks = [track('calm', 'a.ogg'), track('calm', 'b.ogg')];
    for (const r of [0, 0.5, 0.99]) expect(pickTrack(tracks, 'calm', '/music/calm/a.ogg', () => r)?.name).toBe('b.ogg');
    expect(pickTrack([tracks[0]!], 'calm', '/music/calm/a.ogg')?.name).toBe('a.ogg');
  });
});

class FakeAudio extends EventTarget {
  volume = 1;
  loop = true;
  paused = true;
  constructor(public src: string) {
    super();
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
}

describe('StageMusicPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('cross-fades between moods and keeps the track while the mood stays', () => {
    const created: FakeAudio[] = [];
    const player = new StageMusicPlayer((src) => {
      const audio = new FakeAudio(src);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    const tracks = [track('calm', 'a.ogg'), track('combat', 'b.ogg')];

    player.play('calm', tracks);
    expect(created).toHaveLength(1);
    expect(created[0]!.volume).toBe(0);
    vi.advanceTimersByTime(3100);
    expect(created[0]!.volume).toBeCloseTo(0.4);

    player.play('calm', tracks);
    expect(created).toHaveLength(1);

    player.play('combat', tracks);
    expect(created[1]!.src).toBe('asset:///music/combat/b.ogg');
    vi.advanceTimersByTime(3100);
    expect(created[0]!.paused).toBe(true);
    expect(created[1]!.volume).toBeCloseTo(0.4);
    expect(player.mood).toBe('combat');

    // At the end of a track the mood goes on with the next one.
    created[1]!.dispatchEvent(new Event('ended'));
    expect(created).toHaveLength(3);
    expect(created[2]!.src).toBe('asset:///music/combat/b.ogg');

    player.stop();
    vi.advanceTimersByTime(3100);
    expect(created[2]!.paused).toBe(true);
    expect(player.mood).toBeNull();
  });
});
