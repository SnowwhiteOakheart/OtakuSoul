import { api } from './api';
import type { CharacterProfile, VoiceConfig } from '../types';

/** Card extension with the character's voice: `{ "description": "A calm, warm young voice …" }`. */
export const CARD_VOICE_KEY = 'otakusoul_voice';

/** The voice description the character card brings along (English, for VoiceDesign / OpenAI TTS). */
export function cardVoiceDescription(character?: CharacterProfile | null): string {
  const extensions = character?.card.data.extensions as Record<string, unknown> | undefined;
  const voice = extensions?.[CARD_VOICE_KEY] as { description?: unknown } | undefined;
  return typeof voice?.description === 'string' ? voice.description.trim() : '';
}

/** A voice setting without its own description takes the one from the character card. */
export function withCardVoice(config: VoiceConfig, character?: CharacterProfile | null): VoiceConfig {
  if (config.openai_instructions?.trim()) return config;
  const description = cardVoiceDescription(character);
  return description ? { ...config, openai_instructions: description } : config;
}

/** The character's saved voice settings, completed by the card's voice description. */
export async function loadCharacterVoiceConfig(charId: string, characters: (CharacterProfile | null | undefined)[]): Promise<VoiceConfig> {
  const config = await api.getCharacterVoiceConfig(charId);
  return withCardVoice(config, characters.find((c) => c?.id === charId));
}
