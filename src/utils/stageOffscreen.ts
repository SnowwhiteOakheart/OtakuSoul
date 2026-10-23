import type { SceneState } from '../types';

/** A companion tells what happened between the sessions after this long (as `stage/offscreen.rs`). */
export const OFFSCREEN_MIN_PAUSE_SECONDS = 8 * 3600;

/**
 * Whether the story gets a tale of what the companions did meanwhile (the backend checks the same):
 * on for the scene, a companion along, the player has acted, no fight and a long pause.
 */
export function stageOffscreenDue(state: SceneState, nowSeconds = Date.now() / 1000): boolean {
  const last = state.chat_log.at(-1);
  return !!last && !state.definition.disable_offscreen && state.definition.party.length > 0 && !state.combat.is_active
    && state.chat_log.some((m) => m.sender_role === 'player') && nowSeconds - last.timestamp >= OFFSCREEN_MIN_PAUSE_SECONDS;
}
