import { api } from './api';
import { audioPlayer, gainFromVoiceVolume } from './audioPlayer';
import type { CharacterProfile, SceneTurnMessage, VoiceConfig } from '../types';

/** Voice profile of the Soul Stage narrator (game master and NPCs), edited like a character's. */
export const STAGE_NARRATOR_VOICE_ID = 'stage_narrator';

/** Companions speak with their character voice; the game master and NPCs with the narrator's. */
async function voiceFor(message: SceneTurnMessage, characters: CharacterProfile[]): Promise<VoiceConfig | null> {
  let id = STAGE_NARRATOR_VOICE_ID;
  if (message.sender_role === 'companion') {
    const character = characters.find((c) => c.card.data.name.toLowerCase() === message.sender_name.toLowerCase());
    if (character) id = character.id;
  }
  const config = await api.getCharacterVoiceConfig(id).catch(() => null);
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
  if (interrupt) audioPlayer.stop();
  for (const message of messages.filter(isSpoken)) {
    const config = await voiceFor(message, characters);
    if (!config) continue;
    try {
      const url = await api.synthesizeSpeech(message.content, config);
      audioPlayer.enqueue(url, gainFromVoiceVolume(config.volume), config.output_device_id, config.effects);
    } catch (error) {
      console.warn('Stage voice failed:', error);
    }
  }
}

export function stopStageVoice() {
  audioPlayer.stop();
}
