import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { musicSetOf, playableMood, sceneMood, stageMusic, type MusicMood } from '../../services/stageMusic';
import type { SceneState, StageMusicTrack } from '../../types';

/** The music files for a set and the general pool; none when the folder cannot be read. */
const readTracks = (set: string | null) =>
  api.listStageMusic(set).catch(() => [] as StageMusicTrack[]).then((list) => list ?? []);

/**
 * Stage music for the open scene: the mood follows the fight and the game master's pick, the
 * player cross-fades to it while `playing`. A story with its own music (`otakusoul_music`) plays
 * its set first; tracks `otakusoul-data` ships for it are fetched in the background when the
 * scene opens. `reload` reads the folders again (after a download or new files).
 */
export function useStageMusic(state: SceneState | null | undefined, playing: boolean) {
  const definition = state?.definition ?? null;
  const set = musicSetOf(definition);
  const [tracks, setTracks] = useState<StageMusicTrack[] | null>(null);
  const reload = useCallback(async () => setTracks(await readTracks(set)), [set]);

  useEffect(() => {
    let live = true;
    void readTracks(set).then((list) => {
      if (live) setTracks(list);
    });
    return () => {
      live = false;
    };
  }, [set]);

  // The story's shipped tracks: fetched once per set, the list is read again when some came.
  const sceneId = definition?.id ?? '';
  useEffect(() => {
    if (!set || !definition) return undefined;
    let live = true;
    void api
      .ensureSceneMusic(definition)
      .then((fetched) => (live && (fetched ?? 0) > 0 ? readTracks(set) : null))
      .then((list) => {
        if (live && list) setTracks(list);
      })
      .catch((error: unknown) => console.warn('Story music not downloaded:', error));
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per scene and set, not per state update
  }, [set, sceneId]);

  const wanted: MusicMood = sceneMood(state);
  const mood = tracks ? playableMood(wanted, tracks) : null;

  useEffect(() => {
    if (!tracks) return;
    if (playing) stageMusic.play(wanted, tracks);
    else stageMusic.stop();
  }, [wanted, tracks, playing]);

  // Leaving the Stage ends the music.
  useEffect(() => () => stageMusic.stop(), []);

  return {
    set,
    wanted,
    mood,
    hasMusic: (tracks?.length ?? 0) > 0,
    trackCount: tracks?.length ?? 0,
    storyTrackCount: tracks?.filter((t) => t.set).length ?? 0,
    reload,
  };
}
