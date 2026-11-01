import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { playableMood, sceneMood, stageMusic, type MusicMood } from '../../services/stageMusic';
import type { SceneState, StageMusicTrack } from '../../types';

/** The music files per mood; none when the folder cannot be read. */
const readTracks = () => api.listStageMusic().catch(() => [] as StageMusicTrack[]).then((list) => list ?? []);

/**
 * Stage music for the open scene: the mood follows the fight and the game master's pick, the
 * player cross-fades to it while `playing`. `reload` reads the music folder again (after a pack
 * download or new files).
 */
export function useStageMusic(state: SceneState | null | undefined, playing: boolean) {
  const [tracks, setTracks] = useState<StageMusicTrack[] | null>(null);
  const reload = useCallback(async () => setTracks(await readTracks()), []);

  useEffect(() => {
    let live = true;
    void readTracks().then((list) => {
      if (live) setTracks(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const wanted: MusicMood = sceneMood(state);
  const mood = tracks ? playableMood(wanted, tracks) : null;

  useEffect(() => {
    if (!tracks) return;
    if (playing) stageMusic.play(wanted, tracks);
    else stageMusic.stop();
  }, [wanted, tracks, playing]);

  // Leaving the Stage ends the music.
  useEffect(() => () => stageMusic.stop(), []);

  return { wanted, mood, hasMusic: (tracks?.length ?? 0) > 0, trackCount: tracks?.length ?? 0, reload };
}
