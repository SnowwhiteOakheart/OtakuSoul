import { useEffect, useState } from 'react';
import { create } from 'zustand';

/** How fast new Stage text appears: at once, at reading pace, or slowly. */
export type StageTextPace = 'instant' | 'read' | 'slow';
export const STAGE_TEXT_PACES: StageTextPace[] = ['instant', 'read', 'slow'];

/** Letters per second. A voice speaks about 14; reading pace stays a little ahead of it. */
export const PACE_LETTERS: Record<Exclude<StageTextPace, 'instant'>, number> = { read: 25, slow: 14 };

const PACE_KEY = 'otakusoul.stageTextPace';

function storedPace(): StageTextPace {
  try {
    const stored = localStorage.getItem(PACE_KEY);
    return STAGE_TEXT_PACES.includes(stored as StageTextPace) ? (stored as StageTextPace) : 'read';
  } catch {
    return 'read';
  }
}

/** Letters already shown of messages that arrived live and are still being revealed. */
const shown = new Map<string, number>();

interface StageTextPaceState {
  pace: StageTextPace;
  setPace: (pace: StageTextPace) => void;
  /** Reads the stored choice again (the Stage view does so when it opens). */
  reload: () => void;
}

export const useStageTextPace = create<StageTextPaceState>((set) => ({
  pace: storedPace(),
  reload: () => set({ pace: storedPace() }),
  setPace: (pace) => {
    if (pace === 'instant') shown.clear();
    set({ pace });
    try {
      localStorage.setItem(PACE_KEY, pace);
    } catch (error) {
      console.warn('Texttempo konnte nicht gespeichert werden:', error);
    }
  },
}));

/**
 * The part of `text` to show now. Text that streams in (`live`) is revealed at the chosen pace,
 * also once the turn is over and the message sits in the log under the same id; everything else
 * (older messages, lines that never streamed) shows at once.
 */
export function usePacedText(id: string, text: string, live: boolean): string {
  const pace = useStageTextPace((s) => s.pace);
  const [count, setCount] = useState(() => {
    if (live && useStageTextPace.getState().pace !== 'instant' && !shown.has(id)) shown.set(id, 0);
    return shown.get(id) ?? text.length;
  });
  const length = text.length;

  useEffect(() => {
    if (pace === 'instant' || !shown.has(id)) {
      shown.delete(id);
      setCount(length);
      return;
    }
    const letters = PACE_LETTERS[pace];
    let at = shown.get(id) ?? 0;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      at = Math.min(length, at + ((now - last) / 1000) * letters);
      last = now;
      shown.set(id, at);
      setCount(Math.floor(at));
      if (at < length) frame = requestAnimationFrame(step);
      // Done and no longer streaming: from now on the message simply shows.
      else if (!live) shown.delete(id);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [id, length, live, pace]);

  return pace === 'instant' ? text : text.slice(0, Math.min(count, length));
}
