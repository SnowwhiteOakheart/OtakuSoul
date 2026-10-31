import { api } from './api';
import type { VoiceConfig } from '../types';

/** Voice profile of the narrator: the Soul Stage game master and NPCs, and actions in the chat. */
export const STAGE_NARRATOR_VOICE_ID = 'stage_narrator';

let narrator: Promise<VoiceConfig | null> | null = null;

/** The narrator's voice (loaded once), or null when it is switched off or missing. */
export function narratorVoice(): Promise<VoiceConfig | null> {
  narrator ??= api
    .getCharacterVoiceConfig(STAGE_NARRATOR_VOICE_ID)
    .then((config) => (config && config.engine !== 'disabled' ? config : null))
    .catch(() => null);
  return narrator;
}

/** The narrator's voice was saved: load it anew next time. */
export function forgetNarratorVoice() {
  narrator = null;
}

/**
 * Splits a reply into the character's own words and `*actions*` (also `**…**`; an action left
 * open at the end counts as one), without the asterisks. Empty parts are dropped, neighbours of
 * the same kind joined.
 */
export function splitActions(text: string): { action: boolean; text: string }[] {
  const parts: { action: boolean; text: string }[] = [];
  const add = (action: boolean, raw: string) => {
    const piece = raw.replace(/\s+/g, ' ').trim();
    if (!piece) return;
    const last = parts.at(-1);
    if (last && last.action === action) last.text = `${last.text} ${piece}`;
    else parts.push({ action, text: piece });
  };
  const span = /\*+([^*]+?)(?:\*+|$)/g;
  let index = 0;
  for (let match = span.exec(text); match; match = span.exec(text)) {
    add(false, text.slice(index, match.index));
    add(true, match[1]!);
    index = match.index + match[0].length;
  }
  add(false, text.slice(index));
  return parts;
}

/**
 * The parts of `text` with the voice that reads each: with `narrator_for_actions` the
 * character keeps their words and the narrator reads the actions; otherwise (or without a
 * narrator voice) the character reads everything as before.
 */
export async function voiceParts(text: string, voice: VoiceConfig): Promise<{ text: string; voice: VoiceConfig }[]> {
  if (!voice.narrator_for_actions) return [{ text, voice }];
  const reader = await narratorVoice();
  if (!reader) return [{ text, voice }];
  return splitActions(text).map((part) => ({ text: part.text, voice: part.action ? reader : voice }));
}
