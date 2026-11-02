import { api } from './api';
import { audioPlayer, gainFromVoiceVolume } from './audioPlayer';
import type { CharacterProfile, SceneTurnMessage, VoiceConfig } from '../types';
import { findCharacterByName } from '../utils/characterName';
import { STAGE_NARRATOR_VOICE_ID, voiceParts } from './narratorVoice';
import { loadCharacterVoiceConfig } from './characterVoice';
import { clearStageSpeech, scheduleSpeech } from './stageSpeech';

export { STAGE_NARRATOR_VOICE_ID };

/** Companions speak with their character voice; the game master and NPCs with the narrator's. */
async function voiceFor(message: SceneTurnMessage, characters: CharacterProfile[]): Promise<VoiceConfig | null> {
  let id = STAGE_NARRATOR_VOICE_ID;
  if (message.sender_role === 'companion') {
    const character = findCharacterByName(characters, message.sender_name);
    if (character) id = character.id;
  }
  const config = await loadCharacterVoiceConfig(id, characters).catch(() => null);
  return config && config.engine !== 'disabled' ? config : null;
}

/** Messages that are read aloud: everything except the player's own lines. */
export const isSpoken = (message: SceneTurnMessage) => message.sender_role !== 'player' && message.content.trim() !== '';

/**
 * Reads messages one after another; `interrupt` first stops what is playing (a click on
 * "read aloud"), otherwise they queue up behind it (automatic read-aloud after a turn).
 */
export async function speakStageMessages(
  messages: SceneTurnMessage[],
  characters: CharacterProfile[],
  interrupt = false,
): Promise<void> {
  if (interrupt) stopStageVoice();
  for (const message of messages.filter(isSpoken)) {
    const config = await voiceFor(message, characters);
    if (!config) continue;
    try {
      // A companion may leave their *actions* to the narrator.
      for (const part of await voiceParts(message.content, config)) {
        const url = await api.synthesizeSpeech(part.text, part.voice);
        // The sentence bubble follows the clip once it has its place on the audio clock.
        audioPlayer.enqueue(url, gainFromVoiceVolume(part.voice.volume), part.voice.output_device_id, part.voice.effects, (start, end) =>
          scheduleSpeech(message, part.text, start, end),
        );
      }
    } catch (error) {
      console.warn('Stage voice failed:', error);
    }
  }
}

export function stopStageVoice() {
  audioPlayer.stop();
  clearStageSpeech();
}
