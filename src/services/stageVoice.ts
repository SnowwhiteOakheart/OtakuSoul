import { api } from './api';
import { audioPlayer, gainFromVoiceVolume } from './audioPlayer';
import type { CharacterProfile, SceneTurnMessage, VoiceConfig } from '../types';
import { findCharacterByName } from '../utils/characterName';
import { STAGE_NARRATOR_VOICE_ID, voiceParts } from './narratorVoice';
import { loadCharacterVoiceConfig } from './characterVoice';
import { clearStageSpeech, scheduleSpeech, splitSentences } from './stageSpeech';

export { STAGE_NARRATOR_VOICE_ID };

/** What the voice needs of a message: also a live one whose stream just ended. */
export type SpokenMessage = Pick<SceneTurnMessage, 'id' | 'sender_name' | 'sender_role' | 'content'>;

/** Companions speak with their character voice; the game master and NPCs with the narrator's. */
async function voiceFor(message: SpokenMessage, characters: CharacterProfile[]): Promise<VoiceConfig | null> {
  let id = STAGE_NARRATOR_VOICE_ID;
  if (message.sender_role === 'companion') {
    const character = findCharacterByName(characters, message.sender_name);
    if (character) id = character.id;
  }
  const config = await loadCharacterVoiceConfig(id, characters).catch(() => null);
  return config && config.engine !== 'disabled' ? config : null;
}

/** Messages that are read aloud: everything except the player's own lines. */
export const isSpoken = (message: SpokenMessage) => message.sender_role !== 'player' && message.content.trim() !== '';

/** The first clip is short so the voice starts soon; later ones may be longer. */
const FIRST_CHUNK = 120;
const CHUNK = 260;

/** A long text in pieces of whole sentences: the next one is synthesized while one plays. */
export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const sentence of splitSentences(text)) {
    const limit = chunks.length === 0 ? FIRST_CHUNK : CHUNK;
    if (current && current.length + sentence.length + 1 > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Changes when the voice is stopped: queued work of an older session is dropped. */
let session = 0;
/** Messages that were (or must not be) read in this session, so none is read twice. */
const spoken = new Set<string>();
/** One message after the other, also across calls (a live message and the turn's rest). */
let queue: Promise<void> = Promise.resolve();

/**
 * Reads messages one after another; `interrupt` first stops what is playing (a click on
 * "read aloud"), otherwise they queue up behind it. Each message is read once: one read live
 * as soon as its stream ended is skipped when the finished turn arrives.
 */
export function speakStageMessages(messages: SpokenMessage[], characters: CharacterProfile[], interrupt = false): Promise<void> {
  if (interrupt) stopStageVoice();
  const current = session;
  const todo = messages.filter((message) => isSpoken(message) && !spoken.has(message.id));
  todo.forEach((message) => spoken.add(message.id));
  if (todo.length === 0) return queue;
  const read = async () => {
    for (const message of todo) {
      if (current !== session) return;
      const config = await voiceFor(message, characters);
      if (!config) continue;
      try {
        // A companion may leave their *actions* to the narrator.
        for (const part of await voiceParts(message.content, config)) {
          for (const chunk of speechChunks(part.text)) {
            const url = await api.synthesizeSpeech(chunk, part.voice);
            if (current !== session) return;
            // The sentence bubble follows the clip once it has its place on the audio clock.
            audioPlayer.enqueue(url, gainFromVoiceVolume(part.voice.volume), part.voice.output_device_id, part.voice.effects, (start, end) =>
              scheduleSpeech(message, chunk, start, end),
            );
          }
        }
      } catch (error) {
        console.warn('Stage voice failed:', error);
      }
    }
  };
  queue = queue.then(read, read);
  return queue;
}

/** These messages are not read (any more): the player stopped the turn they belong to. */
export function silenceStageMessages(ids: string[]) {
  ids.forEach((id) => spoken.add(id));
}

export function stopStageVoice() {
  session += 1;
  spoken.clear();
  audioPlayer.stop();
  clearStageSpeech();
}
